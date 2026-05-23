import { Injectable } from '@angular/core';
import { ApolloClient, gql } from '@apollo/client/core';
import { Observable } from 'rxjs';
import { GraphQLClientService } from './graphql-client.service';

export interface Device {
  id: string;
  mac: string;
  name: string;
  lastSeenAt: string | null;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class DeviceService {
  private apolloClient: ApolloClient;

  constructor(gqlClient: GraphQLClientService) {
    this.apolloClient = gqlClient.client;
  }

  myDevices(): Observable<Device[]> {
    return new Observable(observer => {
      this.apolloClient.query<{ myDevices: Device[] }>({
        query: gql`
          query MyDevices {
            myDevices { id mac name lastSeenAt createdAt }
          }
        `,
        fetchPolicy: 'network-only',
      })
        .then(result => {
          observer.next(result.data?.myDevices ?? []);
          observer.complete();
        })
        .catch(err => observer.error(err));
    });
  }

  openClaim(): Observable<string> {
    return new Observable(observer => {
      this.apolloClient.mutate<{ openDeviceClaim: string }>({
        mutation: gql`mutation OpenDeviceClaim { openDeviceClaim }`,
      })
        .then(result => {
          observer.next(result.data?.openDeviceClaim ?? '');
          observer.complete();
        })
        .catch(err => observer.error(err));
    });
  }

  cancelClaim(): Observable<boolean> {
    return new Observable(observer => {
      this.apolloClient.mutate<{ cancelDeviceClaim: boolean }>({
        mutation: gql`mutation CancelDeviceClaim { cancelDeviceClaim }`,
      })
        .then(result => {
          observer.next(result.data?.cancelDeviceClaim ?? false);
          observer.complete();
        })
        .catch(err => observer.error(err));
    });
  }

  renameDevice(id: string, name: string): Observable<Device> {
    return new Observable(observer => {
      this.apolloClient.mutate<{ renameDevice: Device }>({
        mutation: gql`
          mutation RenameDevice($id: String!, $name: String!) {
            renameDevice(id: $id, name: $name) { id mac name lastSeenAt createdAt }
          }
        `,
        variables: { id, name },
      })
        .then(result => {
          if (result.data) observer.next(result.data.renameDevice);
          observer.complete();
        })
        .catch(err => observer.error(err));
    });
  }

  removeDevice(id: string): Observable<boolean> {
    return new Observable(observer => {
      this.apolloClient.mutate<{ removeDevice: boolean }>({
        mutation: gql`
          mutation RemoveDevice($id: String!) { removeDevice(id: $id) }
        `,
        variables: { id },
      })
        .then(result => {
          observer.next(result.data?.removeDevice ?? false);
          observer.complete();
        })
        .catch(err => observer.error(err));
    });
  }

  subscribeDeviceClaimed(userId: string): Observable<Device> {
    return new Observable<Device>(observer => {
      const sub = this.apolloClient.subscribe<{ deviceClaimed: Device }>({
        query: gql`
          subscription DeviceClaimed($userId: String!) {
            deviceClaimed(userId: $userId) { id mac name lastSeenAt createdAt }
          }
        `,
        variables: { userId },
      }).subscribe({
        next: (result: any) => {
          const device = result.data?.deviceClaimed;
          if (device) observer.next(device);
        },
        error: err => observer.error(err),
      });
      return () => sub.unsubscribe();
    });
  }
}
