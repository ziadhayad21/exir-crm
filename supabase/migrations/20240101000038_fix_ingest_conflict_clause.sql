-- supabase/migrations/20240101000038_fix_ingest_conflict_clause.sql
-- Fix ON CONFLICT clause in app.ingest_inbound_message to match the exact partial unique index

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
  v_conv_customer_id UUID;
  v_lead_id UUID;
  v_lead_status TEXT;
  v_lead_assigned_to UUID;
  v_assigned_emp_id UUID;
  v_message_id UUID;
  v_is_duplicate_msg BOOLEAN := false;
BEGIN
  v_effective_thread_id := COALESCE(p_external_thread_id, p_external_sender_id);

  -- 1. Advisory lock per thread: serializes processing for the exact same customer thread
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

  -- 3. Customer Identification: if not linked, attempt match by phone in app.customers
  IF v_customer_id IS NULL AND p_sender_phone IS NOT NULL AND p_sender_phone <> '' THEN
    SELECT id INTO v_customer_id
    FROM app.customers
    WHERE phone = p_sender_phone
      AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_customer_id IS NOT NULL THEN
      UPDATE app.channel_identities
      SET customer_id = v_customer_id,
          updated_at = now()
      WHERE id = v_identity_id;
    END IF;
  END IF;

  -- 4. Upsert Conversation Thread
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
    SET customer_id = COALESCE(app.conversations.customer_id, EXCLUDED.customer_id),
        updated_at = now()
  RETURNING id, assigned_to, status, lead_id, unread_count, customer_id
  INTO v_conv_id, v_conv_assigned_to, v_conv_status, v_conv_lead_id, v_conv_unread, v_conv_customer_id;

  v_customer_id := COALESCE(v_customer_id, v_conv_customer_id);

  -- 5. Lead Identification: check if existing conversation has an active lead
  v_lead_id := v_conv_lead_id;

  IF v_lead_id IS NOT NULL THEN
    SELECT status, assigned_to INTO v_lead_status, v_lead_assigned_to
    FROM app.leads
    WHERE id = v_lead_id;

    -- Re-inquiry when previous lead was closed/won/lost creates a NEW fresh lead
    IF v_lead_status IS NULL OR v_lead_status IN ('won', 'lose', 'converted', 'lost') THEN
      v_lead_id := NULL;
    END IF;
  END IF;

  -- If conversation already has an active lead, but lead is unassigned, assign it now
  IF v_lead_id IS NOT NULL AND v_lead_assigned_to IS NULL THEN
    v_assigned_emp_id := app.assign_lead_to_sales(v_lead_id, p_business_tz);
    IF v_assigned_emp_id IS NOT NULL THEN
      v_conv_assigned_to := v_assigned_emp_id;
      v_conv_status := 'open';
      UPDATE app.conversations
      SET assigned_to = v_conv_assigned_to,
          status = v_conv_status,
          updated_at = now()
      WHERE id = v_conv_id;
    END IF;
  END IF;

  -- 6. Create new Lead IF no active lead exists for this conversation
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
      'in_progress',
      CASE WHEN p_channel = 'whatsapp' THEN 'whatsapp' ELSE 'social_media' END,
      'unassigned',
      now()
    )
    RETURNING id INTO v_lead_id;

    -- Call authoritative lead assignment engine
    v_assigned_emp_id := app.assign_lead_to_sales(v_lead_id, p_business_tz);

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

    -- Record audit log for lead assignment
    IF v_assigned_emp_id IS NOT NULL THEN
      INSERT INTO audit.audit_logs (
        actor_id,
        action,
        module,
        entity_type,
        entity_id,
        new_value
      ) VALUES (
        v_assigned_emp_id,
        'lead.assigned',
        'crm',
        'lead',
        v_lead_id::text,
        jsonb_build_object(
          'assigned_to', v_assigned_emp_id,
          'channel', p_channel,
          'conversation_id', v_conv_id
        )
      );
    END IF;
  END IF;

  -- 7. Insert Message (Idempotent by external_message_id)
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

  -- 8. Mark raw event as processed
  IF p_raw_event_id IS NOT NULL THEN
    UPDATE app.webhook_events
    SET status = 'processed',
        processed_at = now()
    WHERE id = p_raw_event_id;
  END IF;

  RETURN jsonb_build_object(
    'message_id', v_message_id,
    'conversation_id', v_conv_id,
    'lead_id', v_lead_id,
    'assigned_to', v_conv_assigned_to,
    'is_duplicate', v_is_duplicate_msg
  );
END;
$$;
