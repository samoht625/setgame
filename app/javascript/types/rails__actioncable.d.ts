declare module '@rails/actioncable' {
  export interface Subscription {
    unsubscribe(): void
    perform(action: string, data?: Record<string, unknown>): boolean
  }

  export interface SubscriptionMixin<TReceived = unknown> {
    initialized?(): void
    connected?(): void
    disconnected?(options?: { willAttemptReconnect?: boolean }): void
    rejected?(): void
    received?(data: TReceived): void
  }

  export interface Subscriptions {
    create<TReceived = unknown>(
      channel: string | { channel: string; [key: string]: unknown },
      mixin?: SubscriptionMixin<TReceived>
    ): Subscription
  }

  export interface Consumer {
    subscriptions: Subscriptions
    connect(): void
    disconnect(): void
  }

  export function createConsumer(url?: string | (() => string)): Consumer
}
