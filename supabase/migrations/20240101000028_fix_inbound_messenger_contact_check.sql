-- supabase/migrations/20240101000028_fix_inbound_messenger_contact_check.sql
-- Fixes leads_contact_check constraint compliance in app.ingest_inbound_message PL/pgSQL function.

CREATE OR REPLACE FUNCTION app.ingest_inbound_message(
  p_raw_event_id UUID,
  p_channel TEXT,
  p_external_sender_id TEXT,
  p_sender_display_name TEXT DEFAULT NULL,
  p_sender_phone TEXT DEFAULT NULL,
  p_external_thread_id TEXT DEFAULT NULL,
  p_external_message_id TEXT DEFAULT NULL,
  p_message_type TEXT DEFAULT 'text',
  p_content TEXT DEFAULT NULL,
  p_media_url TEXT DEFAULT NULL,
  p_business_tz TEXT DEFAULT 'Africa/Cairo'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_effective_thread_id TEXT;
  v_identity_id UUID;
  v_customer_id UUID;
  v_conv_id UUID;
  v_conv_assigned_to UUID;
  v_conv_lead_id UUID;
  v_conv_status TEXT;
  v_conv_unread INT;
  v_lead_id UUID;
  v_lead_status TEXT;
  v_assigned_emp_id UUID;
  v_message_id UUID;
  v_is_duplicate_msg BOOLEAN := false;
BEGIN
  v_effective_thread_id := COALESCE(p_external_thread_id, p_external_sender_id);

  -- 1. Advisory lock per thread: serializes message processing for the exact same customer thread
  PERFORM pg_advisory_xact_lock(hashtext(p_channel || ':' || v_effective_thread_id));

  -- 2. Upsert Channel Identity
  INSERT INTO app.channel_identities (
    channel,
    external_id,
    display_name,
    phone,
    customer_id
  ) VALUES (
    p_channel,
    p_external_sender_id,
    p_sender_display_name,
    p_sender_phone,
    NULL
  )
  ON CONFLICT (channel, external_id) DO UPDATE
    SET display_name = COALESCE(EXCLUDED.display_name, app.channel_identities.display_name),
        phone = COALESCE(EXCLUDED.phone, app.channel_identities.phone),
        updated_at = now()
  RETURNING id, customer_id INTO v_identity_id, v_customer_id;

  -- 3. Upsert Conversation Thread
  INSERT INTO app.conversations (
    channel,
    external_thread_id,
    channel_identity_id,
    customer_id,
    status
  ) VALUES (
    p_channel,
    v_effective_thread_id,
    v_identity_id,
    v_customer_id,
    'open'
  )
  ON CONFLICT (channel, external_thread_id) DO UPDATE
    SET updated_at = now()
  RETURNING id, assigned_to, status, lead_id, unread_count INTO v_conv_id, v_conv_assigned_to, v_conv_status, v_conv_lead_id, v_conv_unread;

  -- 4. Check if existing conversation lead is active
  v_lead_id := v_conv_lead_id;

  IF v_lead_id IS NOT NULL THEN
    SELECT status INTO v_lead_status
    FROM app.leads
    WHERE id = v_lead_id;

    IF v_lead_status IS NULL OR v_lead_status IN ('converted', 'lost') THEN
      v_lead_id := NULL; -- Lead was closed/converted, needs fresh lead for new inquiry
    END IF;
  END IF;

  -- 5. Create new Lead IF no active lead exists for this conversation
  IF v_lead_id IS NULL THEN
    INSERT INTO app.leads (
      full_name,
      notes,
      phone,
      email,
      status,
      source,
      assignment_source,
      received_at
    ) VALUES (
      COALESCE(p_sender_display_name, p_sender_phone, p_external_sender_id),
      CASE WHEN p_content IS NOT NULL AND p_content <> '' THEN 'Initial message: ' || p_content ELSE NULL END,
      p_sender_phone,
      CASE WHEN p_sender_phone IS NULL THEN p_external_sender_id || '@messenger.meta.test' ELSE NULL END,
      'new',
      CASE WHEN p_channel = 'whatsapp' THEN 'whatsapp' ELSE 'social_media' END,
      'unassigned',
      now()
    )
    RETURNING id INTO v_lead_id;

    -- Call authoritative Phase 3 & Phase 4B assignment engine
    v_assigned_emp_id := app.assign_lead_to_sales(v_lead_id, p_business_tz, 5);

    IF v_assigned_emp_id IS NOT NULL THEN
      v_conv_assigned_to := v_assigned_emp_id;
      v_conv_status := 'open';
    ELSE
      v_conv_assigned_to := NULL;
      v_conv_status := 'pending_assignment';
    END IF;

    -- Update conversation record with lead and assignment
    UPDATE app.conversations
    SET lead_id = v_lead_id,
        assigned_to = v_conv_assigned_to,
        status = v_conv_status,
        updated_at = now()
    WHERE id = v_conv_id;
  END IF;

  -- 6. Insert Message (Idempotent by external_message_id)
  IF p_external_message_id IS NOT NULL THEN
    SELECT id INTO v_message_id
    FROM app.messages
    WHERE conversation_id = v_conv_id
      AND external_message_id = p_external_message_id;

    IF v_message_id IS NOT NULL THEN
      v_is_duplicate_msg := true;
    END IF;
  END IF;

  IF NOT v_is_duplicate_msg THEN
    INSERT INTO app.messages (
      conversation_id,
      raw_event_id,
      direction,
      sender_type,
      external_message_id,
      message_type,
      content,
      media_url,
      status,
      received_at
    ) VALUES (
      v_conv_id,
      p_raw_event_id,
      'inbound',
      'contact',
      p_external_message_id,
      COALESCE(p_message_type, 'text'),
      p_content,
      p_media_url,
      'received',
      now()
    )
    ON CONFLICT (conversation_id, external_message_id) WHERE external_message_id IS NOT NULL
    DO UPDATE SET updated_at = app.messages.updated_at
    RETURNING id INTO v_message_id;

    -- Update conversation last message details and increment unread count
    UPDATE app.conversations
    SET last_message_at = now(),
        last_message_preview = SUBSTRING(COALESCE(p_content, '') FROM 1 FOR 100),
        unread_count = COALESCE(unread_count, 0) + 1,
        updated_at = now()
    WHERE id = v_conv_id;
  END IF;

  -- 7. Mark raw event as processed
  IF p_raw_event_id IS NOT NULL THEN
    UPDATE app.webhook_events
    SET status = 'processed',
        processed_at = now()
    WHERE id = p_raw_event_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'conversation_id', v_conv_id,
    'message_id', v_message_id,
    'lead_id', v_lead_id,
    'assigned_to', v_conv_assigned_to,
    'status', v_conv_status,
    'is_duplicate_message', v_is_duplicate_msg
  );
END;
$$;
