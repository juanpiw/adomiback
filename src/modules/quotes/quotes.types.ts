export type QuoteStatus = 'new' | 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';

export type QuoteBucket = QuoteStatus | 'history';

export type QuoteActorType = 'client' | 'provider' | 'system';

export type QuoteEventType =
  | 'request_created'
  | 'draft_saved'
  | 'proposal_sent'
  | 'viewed_by_client'
  | 'viewed_by_provider'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'message_posted'
  | 'attachment_uploaded'
  | 'attachment_removed';

export interface QuoteListRecord {
  id: number;
  provider_id: number;
  client_id: number;
  appointment_id: number | null;
  status: QuoteStatus;
  client_message: string | null;
  service_summary: string | null;
  currency: string;
  proposal_amount: number | null;
  proposal_details: string | null;
  proposal_valid_until: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  client_name: string;
  client_avatar_url: string | null;
  client_since: string | null;
  provider_name?: string | null;
  provider_avatar_url?: string | null;
  provider_since?: string | null;
  provider_city?: string | null;
  provider_country?: string | null;
  appointment_date: string | null;
  appointment_time: string | null;
}

export interface QuoteAttachmentRecord {
  id: number;
  quote_id: number;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  file_size: number | null;
  category: 'client_request' | 'provider_proposal' | 'support';
  uploaded_at: string;
}

export interface QuoteItemRecord {
  id: number;
  quote_id: number;
  position: number;
  title: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface QuoteEventRecord {
  id: number;
  quote_id: number;
  actor_type: QuoteActorType;
  actor_id: number | null;
  event_type: QuoteEventType;
  metadata: any | null;
  created_at: string;
}

export interface QuoteMessageRecord {
  id: number;
  quote_id: number;
  sender_id: number;
  sender_role: 'client' | 'provider';
  message: string;
  read_at: string | null;
  created_at: string;
}

export interface QuoteDetailRecord extends QuoteListRecord {
  items: QuoteItemRecord[];
  attachments: QuoteAttachmentRecord[];
  events: QuoteEventRecord[];
  messages: QuoteMessageRecord[];
}

export interface QuoteProposalPayload {
  amount: number;
  details: string;
  validityDays: number;
  submit: boolean;
  currency?: string | null;
}

export interface QuoteCounters {
  new: number;
  sent: number;
  accepted: number;
  history: number;
}


