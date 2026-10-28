import React, { useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { ChatPeer } from '../../../api/chat/types';
import { MessagesSquare } from '../../../components/icons';
import { useToast } from '../../../components/overlay';
import { Button } from '../../../components/ui';
import { useApiErrorText } from '../../../lib/query';
import { useOpenChat } from './common';

/** Opens the chat with a booking's other party (creating it the first time). */
export function MessageButton({ peer, label, style }: { peer: ChatPeer; label: string; style?: StyleProp<ViewStyle> }) {
  const open = useOpenChat();
  const toast = useToast();
  const apiError = useApiErrorText();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      label={label}
      icon={MessagesSquare}
      variant="secondary"
      loading={busy}
      style={style}
      onPress={async () => {
        setBusy(true);
        try {
          await open(peer);
        } catch (e) {
          toast.error(apiError(e));
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}
