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

  createUser(email: string, password: string, role: 'user' | 'superuser', tier: SubscriptionTier): Observable<AdminUser> {
    return new Observable(observer => {
      this.apolloClient.mutate<{ adminCreateUser: AdminUser }>({
        mutation: gql`
          mutation AdminCreateUser($email: String!, $password: String!, $role: String!, $tier: String!) {
            adminCreateUser(email: $email, password: $password, role: $role, tier: $tier) {
              id email role subscriptionTier createdAt deviceCount plantCount
            }
          }
        `,
        variables: { email, password, role, tier },
      })
        .then(result => { observer.next(result.data!.adminCreateUser); observer.complete(); })
        .catch(err => observer.error(err));
    });
  }

  updateUser(userId: string, patch: { email?: string; role?: 'user' | 'superuser'; tier?: SubscriptionTier }): Observable<AdminUser> {
    return new Observable(observer => {
      this.apolloClient.mutate<{ adminUpdateUser: AdminUser }>({
        mutation: gql`
          mutation AdminUpdateUser($userId: String!, $email: String, $role: String, $tier: String) {
            adminUpdateUser(userId: $userId, email: $email, role: $role, tier: $tier) {
              id email role subscriptionTier createdAt deviceCount plantCount
            }
          }
        `,
        variables: { userId, email: patch.email ?? null, role: patch.role ?? null, tier: patch.tier ?? null },
      })
        .then(result => { observer.next(result.data!.adminUpdateUser); observer.complete(); })
        .catch(err => observer.error(err));
    });
  }

  deleteUser(userId: string): Observable<boolean> {
    return new Observable(observer => {
      this.apolloClient.mutate<{ adminDeleteUser: boolean }>({
        mutation: gql`
          mutation AdminDeleteUser($userId: String!) {
            adminDeleteUser(userId: $userId)
          }
        `,
        variables: { userId },
      })
        .then(result => { observer.next(result.data!.adminDeleteUser); observer.complete(); })
        .catch(err => observer.error(err));
    });
  }
}
