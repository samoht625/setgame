declare module '@rails/actioncable' {
  export interface Subscription {
    unsubscribe(): void
    perform(action: string, data?: Record<string, unknown>): boolean
  }

  export interface Subscriptions {
    create(channel: string | { channel: string; [key: string]: unknown }, mixin?: object): Subscription & Record<string, any>
  }

  export interface Consumer {
    subscriptions: Subscriptions
    connect(): void
    disconnect(): void
  }

  export function createConsumer(url?: string): Consumer
}
