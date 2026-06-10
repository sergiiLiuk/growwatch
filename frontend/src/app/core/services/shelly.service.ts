import { Injectable } from '@angular/core';
import { ApolloClient, gql } from '@apollo/client/core';
import { Observable, defer } from 'rxjs';
import { GraphQLClientService } from './graphql-client.service';

export interface ShellyDevice {
  id: string;
  deviceId: string;
  name: string;
  webhookUrl: string;
  lastSeenAt: string | null;
  lastBatteryPercent: number | null;
  createdAt: string;
}

const SHELLY_FIELDS = `id deviceId name webhookUrl lastSeenAt lastBatteryPercent createdAt`;

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

  add(deviceId: string, name: string): Observable<ShellyDevice> {
    return defer(() =>
      this.apolloClient.mutate<{ addShellyDevice: ShellyDevice }>({
        mutation: gql`
          mutation AddShellyDevice($deviceId: String!, $name: String!) {
            addShellyDevice(deviceId: $deviceId, name: $name) { ${SHELLY_FIELDS} }
          }
        `,
        variables: { deviceId, name },
      }).then(result => result.data!.addShellyDevice)
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

  rotateToken(id: string): Observable<ShellyDevice> {
    return defer(() =>
      this.apolloClient.mutate<{ rotateShellyToken: ShellyDevice }>({
        mutation: gql`
          mutation RotateShellyToken($id: String!) {
            rotateShellyToken(id: $id) { ${SHELLY_FIELDS} }
          }
        `,
        variables: { id },
      }).then(result => result.data!.rotateShellyToken)
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
