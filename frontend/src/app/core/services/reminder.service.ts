import { Injectable } from '@angular/core';
import { ApolloClient, gql } from '@apollo/client/core';
import { Observable } from 'rxjs';
import { GraphQLClientService } from './graphql-client.service';

export type ReminderActionType = 'water' | 'fertilize';

export interface PlantReminder {
  id: string;
  plantId: string;
  actionType: ReminderActionType;
  intervalDays: number;
  nextDueAt: Date;
  snoozedUntil: Date | null;
  enabled: boolean;
}

interface RawReminder {
  id: string;
  plantId: string;
  actionType: ReminderActionType;
  intervalDays: number;
  nextDueAt: string;
  snoozedUntil: string | null;
  enabled: boolean;
}

function mapReminder(r: RawReminder): PlantReminder {
  return {
    ...r,
    nextDueAt: new Date(r.nextDueAt),
    snoozedUntil: r.snoozedUntil ? new Date(r.snoozedUntil) : null,
  };
}

const REMINDERS_QUERY = gql`
  query PlantReminders($plantId: String) {
    plantReminders(plantId: $plantId) {
      id plantId actionType intervalDays nextDueAt snoozedUntil enabled
    }
  }
`;

const SET_REMINDER = gql`
  mutation SetPlantReminder($plantId: String!, $actionType: ReminderActionType!, $intervalDays: Int!, $enabled: Boolean!) {
    setPlantReminder(plantId: $plantId, actionType: $actionType, intervalDays: $intervalDays, enabled: $enabled) {
      id plantId actionType intervalDays nextDueAt snoozedUntil enabled
    }
  }
`;

const REMOVE_REMINDER = gql`mutation RemovePlantReminder($id: String!) { removePlantReminder(id: $id) }`;

const SNOOZE_REMINDER = gql`
  mutation SnoozeReminder($id: String!, $hours: Int) {
    snoozeReminder(id: $id, hours: $hours) {
      id plantId actionType intervalDays nextDueAt snoozedUntil enabled
    }
  }
`;

@Injectable({ providedIn: 'root' })
export class ReminderService {
  private client: ApolloClient;
  constructor(gql: GraphQLClientService) { this.client = gql.client; }

  list(plantId?: string): Observable<PlantReminder[]> {
    return new Observable(observer => {
      this.client.query<{ plantReminders: RawReminder[] }>({
        query: REMINDERS_QUERY,
        variables: { plantId: plantId ?? null },
        fetchPolicy: 'network-only',
      })
        .then(r => {
          observer.next((r.data?.plantReminders ?? []).map(mapReminder));
          observer.complete();
        })
        .catch(err => observer.error(err));
    });
  }

  set(plantId: string, actionType: ReminderActionType, intervalDays: number, enabled: boolean): Observable<PlantReminder> {
    return new Observable(observer => {
      this.client.mutate<{ setPlantReminder: RawReminder }>({
        mutation: SET_REMINDER,
        variables: { plantId, actionType, intervalDays, enabled },
      })
        .then(r => { observer.next(mapReminder(r.data!.setPlantReminder)); observer.complete(); })
        .catch(err => observer.error(err));
    });
  }

  remove(id: string): Observable<boolean> {
    return new Observable(observer => {
      this.client.mutate<{ removePlantReminder: boolean }>({
        mutation: REMOVE_REMINDER,
        variables: { id },
      })
        .then(() => { observer.next(true); observer.complete(); })
        .catch(err => observer.error(err));
    });
  }

  snooze(id: string, hours = 24): Observable<PlantReminder> {
    return new Observable(observer => {
      this.client.mutate<{ snoozeReminder: RawReminder }>({
        mutation: SNOOZE_REMINDER,
        variables: { id, hours },
      })
        .then(r => { observer.next(mapReminder(r.data!.snoozeReminder)); observer.complete(); })
        .catch(err => observer.error(err));
    });
  }

  /** A reminder is "due" if nextDueAt is in the past and not currently snoozed. */
  static isDue(r: PlantReminder, now: Date = new Date()): boolean {
    if (!r.enabled) return false;
    if (r.nextDueAt.getTime() > now.getTime()) return false;
    if (r.snoozedUntil && r.snoozedUntil.getTime() > now.getTime()) return false;
    return true;
  }
}
