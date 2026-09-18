import { useEffect, useState } from 'react'

import { Transport } from '@/features/gameplay/transport'

/** Gives a component one long-lived Transport and tears it down on unmount. */
export function useTransport(): Transport {
  // Lazy initializer, so the Transport is constructed once rather than per render.
  const [transport] = useState(() => new Transport())

  useEffect(() => {
    return () => {
      void transport.dispose()
    }
  }, [transport])

  return transport
}
