import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../../auth/AuthContext';
import { chatApi } from '../../../api/chat/api';
import { chatKeys } from '../../../api/chat/keys';
import { useQuery } from '../../../lib/query';
import type { ChatMessage, ChatPeer, ChatScope } from '../../../api/chat/types';
import { useLabels } from '../../../i18n/format';
import { useT } from '../../../i18n';
import type { Specialty } from '../../../api/types';
import type { ChatRoutes } from '../../../navigation/types';

/** Chat runs as the signed-in side. */
export function useChatScope(): ChatScope {
  return useAuth().role === 'caregiver' ? 'caregiver' : 'customer';
}

export function useChatNav() {
  return useNavigation<NativeStackNavigationProp<ChatRoutes>>();
}

/** "Nursing" for a caregiver, "Family" for a customer. */
export function usePeerRole() {
  const L = useLabels();
  const t = useT('mobile.chat');
  return useCallback((role: string) => (role === 'FAMILY' ? t('family') : L.specialty(role as Specialty)), [L, t]);
}

/** Opens (creating if needed) the conversation with a booking's other party. */
export function useOpenChat() {
  const scope = useChatScope();
  const nav = useChatNav();
  return useCallback(
    async (peer: ChatPeer) => {
      const c = await chatApi(scope).open(peer);
      nav.navigate('Chat', { id: c.id, name: c.peer.name });
    },
    [scope, nav],
  );
}

/** One-line preview for the list and reply quotes. */
export function usePreview() {
  const t = useT('mobile.chat');
  return useCallback(
    (m: Pick<ChatMessage, 'type' | 'text' | 'deleted'>) => {
      if (m.deleted) return `🚫 ${t('deleted')}`;
      if (m.type === 'text') return m.text ?? '';
      const label = m.type === 'image' ? `📷 ${t('photo')}` : m.type === 'video' ? `🎥 ${t('video')}` : m.type === 'voice' ? `🎤 ${t('voice')}` : `📎 ${t('file')}`;
      return m.text ? `${label}: ${m.text}` : label;
    },
    [t],
  );
}

/** Arabic-script text reads right-to-left whatever the app language. */
const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
export const isRtlText = (text: string) => ARABIC.test(text.slice(0, 40));

/** "9:05 PM" from an ISO time. */
export function clock(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  return `⁦${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}⁩`;
}

/** Unread chat messages across conversations, for the header icon badge. */
export function useChatUnread(): number {
  const scope = useChatScope();
  const list = useQuery(chatKeys.conversations(scope), () => chatApi(scope).conversations());
  return (list.data ?? []).reduce((n, c) => n + c.unread, 0);
}
