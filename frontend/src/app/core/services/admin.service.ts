import { Injectable } from '@angular/core';
import { ApolloClient, gql } from '@apollo/client/core';
import { Observable } from 'rxjs';
import { GraphQLClientService } from './graphql-client.service';
import { SubscriptionTier } from './auth.service';

export interface AdminUser {
  id: string;
  email: string;
  role: string;
  subscriptionTier: SubscriptionTier;
  createdAt: string;
  deviceCount: number;
  plantCount: number;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private apolloClient: ApolloClient;

  constructor(gqlClient: GraphQLClientService) {
    this.apolloClient = gqlClient.client;
  }

  allUsers(): Observable<AdminUser[]> {
    return new Observable(observer => {
      this.apolloClient.query<{ allUsers: AdminUser[] }>({
        query: gql`
          query AllUsers {
            allUsers { id email role subscriptionTier createdAt deviceCount plantCount }
          }
        `,
        fetchPolicy: 'network-only',
      })
        .then(result => {
          observer.next(result.data?.allUsers ?? []);
          observer.complete();
        })
        .catch(err => observer.error(err));
    });
  }

  setSubscriptionTier(userId: string, tier: SubscriptionTier): Observable<AdminUser> {
    return new Observable(observer => {
      this.apolloClient.mutate<{ setSubscriptionTier: AdminUser }>({
        mutation: gql`
          mutation SetSubscriptionTier($userId: String!, $tier: String!) {
            setSubscriptionTier(userId: $userId, tier: $tier) {
              id email role subscriptionTier createdAt deviceCount plantCount
            }
          }
        `,
        variables: { userId, tier },
      })
        .then(result => {
          observer.next(result.data!.setSubscriptionTier);
          observer.complete();
        })
        .catch(err => observer.error(err));
    });
  }
}
