import { Injectable, inject } from '@angular/core';
import { ApolloClient, gql } from '@apollo/client/core';
import { Observable, defer } from 'rxjs';
import dayjs from 'dayjs';
import { GraphQLClientService } from './graphql-client.service';
import { PlantType } from './plant.service';
import { PlantActionType } from './plant-action.service';

export type PlantEventStatus = 'completed' | 'upcoming';

export interface PlantEvent {
  id: string;
  plantId: string;
  plantName: string;
  plantType: PlantType;
  type: PlantActionType;
  scheduledAt: Date;
  status: PlantEventStatus;
  note: string | null;
}

interface RawPlantEvent {
  id: string;
  plantId: string;
  plantName: string;
  plantType: string;
  type: string;
  scheduledAt: string;
  status: PlantEventStatus;
  note: string | null;
}

const PLANT_EVENTS_QUERY = gql`
  query PlantEvents($from: String!, $to: String!) {
    plantEvents(from: $from, to: $to) {
      id plantId plantName plantType type scheduledAt status note
    }
  }
`;

@Injectable({ providedIn: 'root' })
export class PlantEventService {
  private client: ApolloClient;

  constructor(gqlClient: GraphQLClientService) {
    this.client = gqlClient.client;
  }

  /** Fetch past actions + projected reminders within [from, to] (inclusive). */
  list(from: Date, to: Date): Observable<PlantEvent[]> {
    return defer(() =>
      this.client.query<{ plantEvents: RawPlantEvent[] }>({
        query: PLANT_EVENTS_QUERY,
        variables: { from: dayjs(from).toISOString(), to: dayjs(to).toISOString() },
        fetchPolicy: 'network-only',
      }).then(res => (res.data?.plantEvents ?? []).map(e => ({
        ...e,
        plantType: e.plantType as PlantType,
        type: e.type as PlantActionType,
        scheduledAt: new Date(e.scheduledAt),
      })))
    );
  }
}
