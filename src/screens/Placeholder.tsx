import React from 'react';
import { EmptyState, Screen } from '../components/screen';

/** Temporary stand-in while a screen is being built. */
export function Placeholder({ name }: { name: string }) {
  return (
    <Screen title={name} back>
      <EmptyState title={name} text="Screen coming next." />
    </Screen>
  );
}
