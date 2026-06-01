import { Injectable, inject, signal } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { ApolloClient, gql } from '@apollo/client/core';
import { GraphQLClientService } from './graphql-client.service';

const VAPID_QUERY = gql`query VapidPublicKey { vapidPublicKey }`;
const SUBSCRIBE = gql`
  mutation SubscribeToPush($subscription: PushSubscriptionInput!) {
    subscribeToPush(subscription: $subscription)
  }
`;
const UNSUBSCRIBE = gql`mutation UnsubscribeFromPush($endpoint: String!) { unsubscribeFromPush(endpoint: $endpoint) }`;

@Injectable({ providedIn: 'root' })
export class PushService {
  private swPush = inject(SwPush);
  private client: ApolloClient;
  private cachedVapidKey: string | null = null;

  enabled = signal(false);
  supported = this.swPush.isEnabled;

  constructor(gql: GraphQLClientService) {
    this.client = gql.client;
    // Reflect existing subscription state on load
    this.swPush.subscription.subscribe(sub => this.enabled.set(!!sub));
  }

  /** Returns true if push is supported AND a service worker is registered. */
  isSupported(): boolean {
    return this.swPush.isEnabled;
  }

  /** Asks the browser for permission + creates a subscription + posts it to the backend. */
  async subscribe(): Promise<boolean> {
    if (!this.swPush.isEnabled) return false;
    const vapid = await this.getVapidKey();
    if (!vapid) return false;
    try {
      const sub = await this.swPush.requestSubscription({ serverPublicKey: vapid });
      const json: any = sub.toJSON();
      await this.client.mutate({
        mutation: SUBSCRIBE,
        variables: {
          subscription: {
            endpoint: json.endpoint,
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
          },
        },
      });
      this.enabled.set(true);
      return true;
    } catch (err) {
      console.error('Push subscribe failed:', err);
      return false;
    }
  }

  async unsubscribe(): Promise<void> {
    if (!this.swPush.isEnabled) return;
    try {
      const sub = await new Promise<PushSubscription | null>(resolve => {
        this.swPush.subscription.subscribe(s => resolve(s));
      });
      const endpoint = sub?.endpoint;
      await this.swPush.unsubscribe();
      if (endpoint) {
        await this.client.mutate({ mutation: UNSUBSCRIBE, variables: { endpoint } });
      }
      this.enabled.set(false);
    } catch (err) {
      console.error('Push unsubscribe failed:', err);
    }
  }

  /** Subscribe to incoming push messages while the app is open. Routes the user to the URL in the payload. */
  onMessages(handler: (data: any) => void): void {
    if (!this.swPush.isEnabled) return;
    this.swPush.messages.subscribe(handler);
  }

  /** Subscribe to clicks on notifications that opened the app from the background. */
  onClicks(handler: (action: { action: string; notification: any }) => void): void {
    if (!this.swPush.isEnabled) return;
    this.swPush.notificationClicks.subscribe(handler);
  }

  private async getVapidKey(): Promise<string | null> {
    if (this.cachedVapidKey) return this.cachedVapidKey;
    try {
      const r = await this.client.query<{ vapidPublicKey: string | null }>({
        query: VAPID_QUERY,
        fetchPolicy: 'network-only',
      });
      this.cachedVapidKey = r.data?.vapidPublicKey ?? null;
      return this.cachedVapidKey;
    } catch (err) {
      console.error('Failed to fetch VAPID key:', err);
      return null;
    }
  }
}
