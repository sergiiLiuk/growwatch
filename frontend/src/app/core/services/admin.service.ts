import { Injectable } from '@angular/core';
import { ApolloClient, gql } from '@apollo/client/core';
import { Observable, defer } from 'rxjs';
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

const USER_FIELDS = `id email role subscriptionTier createdAt deviceCount plantCount`;

@Injectable({ providedIn: 'root' })
export class AdminService {
  private apolloClient: ApolloClient;

  constructor(gqlClient: GraphQLClientService) {
    this.apolloClient = gqlClient.client;
  }

  allUsers(): Observable<AdminUser[]> {
    return defer(() =>
      this.apolloClient.query<{ allUsers: AdminUser[] }>({
        query: gql`query AllUsers { allUsers { ${USER_FIELDS} } }`,
        fetchPolicy: 'network-only',
      }).then(result => result.data?.allUsers ?? [])
    );
  }

  setSubscriptionTier(userId: string, tier: SubscriptionTier): Observable<AdminUser> {
    return defer(() =>
      this.apolloClient.mutate<{ setSubscriptionTier: AdminUser }>({
        mutation: gql`
          mutation SetSubscriptionTier($userId: String!, $tier: String!) {
            setSubscriptionTier(userId: $userId, tier: $tier) { ${USER_FIELDS} }
          }
        `,
        variables: { userId, tier },
      }).then(result => result.data!.setSubscriptionTier)
    );
  }

  createUser(email: string, password: string, role: 'user' | 'superuser' | 'demo', tier: SubscriptionTier): Observable<AdminUser> {
    return defer(() =>
      this.apolloClient.mutate<{ adminCreateUser: AdminUser }>({
        mutation: gql`
          mutation AdminCreateUser($email: String!, $password: String!, $role: String!, $tier: String!) {
            adminCreateUser(email: $email, password: $password, role: $role, tier: $tier) { ${USER_FIELDS} }
          }
        `,
        variables: { email, password, role, tier },
      }).then(result => result.data!.adminCreateUser)
    );
  }

  updateUser(userId: string, patch: { email?: string; role?: 'user' | 'superuser' | 'demo'; tier?: SubscriptionTier }): Observable<AdminUser> {
    return defer(() =>
      this.apolloClient.mutate<{ adminUpdateUser: AdminUser }>({
        mutation: gql`
          mutation AdminUpdateUser($userId: String!, $email: String, $role: String, $tier: String) {
            adminUpdateUser(userId: $userId, email: $email, role: $role, tier: $tier) { ${USER_FIELDS} }
          }
        `,
        variables: {
          userId,
          email: patch.email ?? null,
          role: patch.role ?? null,
          tier: patch.tier ?? null,
        },
      }).then(result => result.data!.adminUpdateUser)
    );
  }

  deleteUser(userId: string): Observable<boolean> {
    return defer(() =>
      this.apolloClient.mutate<{ adminDeleteUser: boolean }>({
        mutation: gql`
          mutation AdminDeleteUser($userId: String!) {
            adminDeleteUser(userId: $userId)
          }
        `,
        variables: { userId },
      }).then(result => result.data!.adminDeleteUser)
    );
  }
}
