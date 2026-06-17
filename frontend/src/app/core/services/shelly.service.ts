import { Injectable } from '@angular/core';
import { ApolloClient, gql } from '@apollo/client/core';
import { Observable, defer } from 'rxjs';
import { GraphQLClientService } from './graphql-client.service';

export interface ShellyDevice {
  id: string;
  deviceId: string;
  name: string;
  lastSeenAt: string | null;
  lastBatteryPercent: number | null;
  createdAt: string;
}

export interface ShellyCloudDevice {
  id: string;
  name: string;
  online: boolean;
}

export interface ShellyAccountInfo {
  connected: boolean;
  status: string;
}

const SHELLY_FIELDS = `id deviceId name lastSeenAt lastBatteryPercent createdAt`;

@Injectable({ providedIn: 'root' })
export class ShellyService {
  private apolloClient: ApolloClient;

  constructor(gqlClient: GraphQLClientService) {
    this.apolloClient = gqlClient.client;
  }

  list(): Observable<ShellyDevice[]> {
    return defer(() =>
      this.apolloClient.query<{ myShellyDevices: ShellyDevice[] }>({
        query: gql`
          query MyShellyDevices { myShellyDevices { ${SHELLY_FIELDS} } }
        `,
        fetchPolicy: 'network-only',
      }).then(result => result.data?.myShellyDevices ?? [])
    );
  }

  account(): Observable<ShellyAccountInfo> {
    return defer(() =>
      this.apolloClient.query<{ shellyAccount: ShellyAccountInfo }>({
        query: gql`query ShellyAccount { shellyAccount { connected status } }`,
        fetchPolicy: 'network-only',
      }).then(r => r.data!.shellyAccount)
    );
  }

  connectAccount(authKey: string, serverHost: string): Observable<ShellyCloudDevice[]> {
    return defer(() =>
      this.apolloClient.mutate<{ connectShellyAccount: ShellyCloudDevice[] }>({
        mutation: gql`
          mutation ConnectShelly($authKey: String!, $serverHost: String!) {
            connectShellyAccount(authKey: $authKey, serverHost: $serverHost) { id name online }
          }
        `,
        variables: { authKey, serverHost },
      }).then(r => r.data!.connectShellyAccount)
    );
  }

  linkDevice(deviceId: string, name: string): Observable<ShellyDevice> {
    return defer(() =>
      this.apolloClient.mutate<{ linkShellyDevice: ShellyDevice }>({
        mutation: gql`
          mutation LinkShelly($deviceId: String!, $name: String!) {
            linkShellyDevice(deviceId: $deviceId, name: $name) { ${SHELLY_FIELDS} }
          }
        `,
        variables: { deviceId, name },
      }).then(r => r.data!.linkShellyDevice)
    );
  }

  disconnectAccount(): Observable<boolean> {
    return defer(() =>
      this.apolloClient.mutate<{ disconnectShellyAccount: boolean }>({
        mutation: gql`mutation DisconnectShelly { disconnectShellyAccount }`,
      }).then(r => r.data!.disconnectShellyAccount)
    );
  }

  rename(id: string, name: string): Observable<ShellyDevice> {
    return defer(() =>
      this.apolloClient.mutate<{ renameShellyDevice: ShellyDevice }>({
        mutation: gql`
          mutation RenameShellyDevice($id: String!, $name: String!) {
            renameShellyDevice(id: $id, name: $name) { ${SHELLY_FIELDS} }
          }
        `,
        variables: { id, name },
      }).then(result => result.data!.renameShellyDevice)
    );
  }

  remove(id: string): Observable<boolean> {
    return defer(() =>
      this.apolloClient.mutate<{ removeShellyDevice: boolean }>({
        mutation: gql`
          mutation RemoveShellyDevice($id: String!) {
            removeShellyDevice(id: $id)
          }
        `,
        variables: { id },
      }).then(result => result.data!.removeShellyDevice)
    );
  }
}
