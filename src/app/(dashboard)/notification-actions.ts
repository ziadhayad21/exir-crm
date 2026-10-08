// src/app/(dashboard)/notification-actions.ts
// Server actions for managing DB-backed follow-up notifications.

'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUserProfile, hasPermission } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export interface FollowUpNotification {
  id: string;
  employee_id: string;
  title: string;
  message: string;
  type: string;
  entity_type: string;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
  // Enriched lead & conversation context
  lead_name: string;
  phone: string | null;
  follow_up_at: string | null;
  notes: string | null;
  lead_status: string;
  conversation_id: string | null;
  due_status: 'overdue' | 'due' | 'upcoming';
  status_label: string;
  formatted_time: string;
  time_remaining: string;
}

function formatCairoFollowUp(isoDate?: string | null): {
  formatted: string;
  formattedEn: string;
  due_status: 'overdue' | 'due' | 'upcoming';
  status_label: string;
  time_remaining: string;
} {
  if (!isoDate) {
    return {
      formatted: 'غير محدد',
      formattedEn: 'Not scheduled',
      due_status: 'upcoming',
      status_label: 'مجدول',
      time_remaining: '',
    };
  }

  const d = new Date(isoDate);
  if (isNaN(d.getTime())) {
    return {
      formatted: 'غير صالح',
      formattedEn: 'Invalid date',
      due_status: 'upcoming',
      status_label: 'مجدول',
      time_remaining: '',
    };
  }

  const now = Date.now();
  const diffMs = d.getTime() - now;
  const diffMinutes = Math.round(diffMs / (60 * 1000));
  const diffHours = Math.round(diffMs / (60 * 60 * 1000));

  let due_status: 'overdue' | 'due' | 'upcoming' = 'upcoming';
  let status_label = 'قادم';
  let time_remaining = '';

  if (diffMs < -5 * 60 * 1000) {
    due_status = 'overdue';
    status_label = 'متأخر';
    const pastMins = Math.abs(diffMinutes);
    if (pastMins < 60) {
      time_remaining = `متأخر منذ ${pastMins} دقيقة`;
    } else {
      time_remaining = `متأخر منذ ${Math.abs(diffHours)} ساعة`;
    }
  } else if (diffMs >= -5 * 60 * 1000 && diffMs <= 60 * 60 * 1000) {
    due_status = 'due';
    status_label = 'حان الموعد';
    time_remaining = diffMinutes <= 0 ? 'حان الموعد الآن' : `متبقي ${diffMinutes} دقيقة`;
  } else {
    due_status = 'upcoming';
    status_label = 'قادم';
    if (diffHours < 24) {
      time_remaining = `بعد ${diffHours} ساعة`;
    } else {
      const days = Math.round(diffHours / 24);
      time_remaining = `بعد ${days} يوم`;
    }
  }

  // Format in Cairo time with Latin numerals: "الخميس، 8 أكتوبر - 08:39 ص"
  const formatted = d.toLocaleString('ar-EG-u-nu-latn', {
    timeZone: 'Africa/Cairo',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const formattedEn = d.toLocaleString('en-US', {
    timeZone: 'Africa/Cairo',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return { formatted, formattedEn, due_status, status_label, time_remaining };
}

/**
 * Fetch all notifications for the current employee (or all for admin).
 * Automatically checks and registers any scheduled or due follow-ups from app.leads.
 */
export async function getNotifications(): Promise<{
  notifications: FollowUpNotification[];
  unreadCount: number;
}> {
  try {
    const profile = await getCurrentUserProfile();
    if (!profile) return { notifications: [], unreadCount: 0 };

    const admin = createAdminClient();
    const isAdmin =
      hasPermission(profile, 'crm.leads.read_all') ||
      hasPermission(profile, 'admin.system');

    // 1. Process due reminders via PG function
    try {
      await admin.rpc('process_follow_up_reminders');
    } catch {
      // Ignored if worker function locked
    }

    // 2. Ensure all leads in 'follow_up' status have an internal notification record
    const { data: followUpLeads } = await admin
      .from('leads')
      .select('id, full_name, phone, follow_up_at, notes, status, assigned_to')
      .eq('status', 'follow_up');

    if (followUpLeads && followUpLeads.length > 0) {
      for (const fl of followUpLeads) {
        const { data: existingNotif } = await admin
          .from('notifications')
          .select('id, is_read')
          .eq('entity_id', fl.id)
          .eq('type', 'follow_up_reminder')
          .maybeSingle();

        if (!existingNotif) {
          const empTarget = fl.assigned_to || profile.employee.id;
          const { formattedEn } = formatCairoFollowUp(fl.follow_up_at);

          await admin.from('notifications').insert({
            employee_id: empTarget,
            title: `Follow-Up: ${fl.full_name}`,
            message: `Scheduled for ${formattedEn} (Cairo). ${fl.notes ? 'Notes: ' + fl.notes : ''}`,
            type: 'follow_up_reminder',
            entity_type: 'lead',
            entity_id: fl.id,
            is_read: false,
          });
        }
      }
    }

    // 3. Mark notifications as read if their leads are no longer in 'follow_up' status (e.g. converted or won)
    const activeFollowUpIds = new Set((followUpLeads || []).map((l) => l.id));
    const { data: pendingNotifs } = await admin
      .from('notifications')
      .select('id, entity_id')
      .eq('type', 'follow_up_reminder')
      .eq('is_read', false);

    if (pendingNotifs && pendingNotifs.length > 0) {
      const idsToClose = pendingNotifs
        .filter((n) => n.entity_id && !activeFollowUpIds.has(n.entity_id))
        .map((n) => n.id);

      if (idsToClose.length > 0) {
        await admin
          .from('notifications')
          .update({ is_read: true })
          .in('id', idsToClose);
      }
    }

    // 4. Query notifications
    let query = admin
      .from('notifications')
      .select('*')
      .order('is_read', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(30);

    if (!isAdmin) {
      query = query.eq('employee_id', profile.employee.id);
    }

    const { data: rawNotifs, error: notifErr } = await query;
    if (notifErr || !rawNotifs) {
      return { notifications: [], unreadCount: 0 };
    }

    // 5. Enrich with lead details and conversation ID
    const leadIds = rawNotifs
      .filter((n) => n.entity_type === 'lead' && n.entity_id)
      .map((n) => n.entity_id as string);

    const leadMap = new Map<string, { full_name: string; phone: string | null; follow_up_at: string | null; notes: string | null; status: string }>();
    const convMap = new Map<string, string>();

    if (leadIds.length > 0) {
      const [leadsRes, convsRes] = await Promise.all([
        admin.from('leads').select('id, full_name, phone, follow_up_at, notes, status').in('id', leadIds),
        admin.from('conversations').select('id, lead_id').in('lead_id', leadIds),
      ]);

      if (leadsRes.data) {
        for (const l of leadsRes.data) {
          leadMap.set(l.id, l);
        }
      }
      if (convsRes.data) {
        for (const c of convsRes.data) {
          if (c.lead_id) convMap.set(c.lead_id, c.id);
        }
      }
    }

    const enriched: FollowUpNotification[] = rawNotifs.map((n) => {
      const lead = n.entity_id ? leadMap.get(n.entity_id) : null;
      const targetDate = lead?.follow_up_at || null;
      const dateInfo = formatCairoFollowUp(targetDate);

      return {
        id: n.id,
        employee_id: n.employee_id,
        title: n.title,
        message: n.message,
        type: n.type,
        entity_type: n.entity_type,
        entity_id: n.entity_id,
        is_read: n.is_read,
        created_at: n.created_at,
        lead_name: lead?.full_name || n.title.replace('Follow-Up: ', ''),
        phone: lead?.phone || null,
        follow_up_at: targetDate,
        notes: lead?.notes || null,
        lead_status: lead?.status || 'follow_up',
        conversation_id: n.entity_id ? convMap.get(n.entity_id) || null : null,
        due_status: dateInfo.due_status,
        status_label: dateInfo.status_label,
        formatted_time: dateInfo.formatted,
        time_remaining: dateInfo.time_remaining,
      };
    });

    const unreadCount = enriched.filter((n) => !n.is_read).length;

    return { notifications: enriched, unreadCount };
  } catch (err) {
    console.error('getNotifications error:', err);
    return { notifications: [], unreadCount: 0 };
  }
}

/**
 * Mark a single notification as read.
 */
export async function markNotificationAsRead(notificationId: string): Promise<{ success: boolean }> {
  try {
    const admin = createAdminClient();
    await admin
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    revalidatePath('/crm/inbox');
    return { success: true };
  } catch (err) {
    console.error('markNotificationAsRead error:', err);
    return { success: false };
  }
}

/**
 * Mark all unread notifications for current employee as read.
 */
export async function markAllNotificationsAsRead(): Promise<{ success: boolean }> {
  try {
    const profile = await getCurrentUserProfile();
    if (!profile) return { success: false };

    const admin = createAdminClient();
    const isAdmin =
      hasPermission(profile, 'crm.leads.read_all') ||
      hasPermission(profile, 'admin.system');

    let query = admin.from('notifications').update({ is_read: true }).eq('is_read', false);
    if (!isAdmin) {
      query = query.eq('employee_id', profile.employee.id);
    }
    await query;

    revalidatePath('/crm/inbox');
    return { success: true };
  } catch (err) {
    console.error('markAllNotificationsAsRead error:', err);
    return { success: false };
  }
}

/**
 * Mark any notification belonging to a specific lead as read (e.g. after customer followup/reply).
 */
export async function markLeadNotificationsAsRead(leadId: string): Promise<{ success: boolean }> {
  try {
    const admin = createAdminClient();
    await admin
      .from('notifications')
      .update({ is_read: true })
      .eq('entity_id', leadId);

    revalidatePath('/crm/inbox');
    return { success: true };
  } catch (err) {
    console.error('markLeadNotificationsAsRead error:', err);
    return { success: false };
  }
}
