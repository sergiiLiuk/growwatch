import { Injectable } from '@angular/core';
import { ApolloClient, gql } from '@apollo/client/core';
import { Observable, defer } from 'rxjs';
import { GraphQLClientService } from './graphql-client.service';

export type ReminderActionType = 'water' | 'fertilize';

export interface PlantReminder {
  id: string;
  plantId: string;
  actionType: ReminderActionType;
  intervalDays: number;
  notifyTime: string | null;
  nextDueAt: Date;
  snoozedUntil: Date | null;
  enabled: boolean;
}

interface RawReminder {
  id: string;
  plantId: string;
  actionType: ReminderActionType;
  intervalDays: number;
  notifyTime: string | null;
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

const REMINDER_FIELDS = `id plantId actionType intervalDays notifyTime nextDueAt snoozedUntil enabled`;

const REMINDERS_QUERY = gql`
  query PlantReminders($plantId: String) {
    plantReminders(plantId: $plantId) { ${REMINDER_FIELDS} }
  }
`;

const SET_REMINDER = gql`
  mutation SetPlantReminder($plantId: String!, $actionType: ReminderActionType!, $intervalDays: Float!, $enabled: Boolean!, $notifyTime: String) {
    setPlantReminder(plantId: $plantId, actionType: $actionType, intervalDays: $intervalDays, enabled: $enabled, notifyTime: $notifyTime) { ${REMINDER_FIELDS} }
  }
`;

const REMOVE_REMINDER = gql`mutation RemovePlantReminder($id: String!) { removePlantReminder(id: $id) }`;

const SNOOZE_REMINDER = gql`
  mutation SnoozeReminder($id: String!, $hours: Int) {
    snoozeReminder(id: $id, hours: $hours) { ${REMINDER_FIELDS} }
  }
`;

@Injectable({ providedIn: 'root' })
export class ReminderService {
  private client: ApolloClient;
  constructor(gql: GraphQLClientService) { this.client = gql.client; }

  list(plantId?: string): Observable<PlantReminder[]> {
    return defer(() =>
      this.client.query<{ plantReminders: RawReminder[] }>({
        query: REMINDERS_QUERY,
        variables: { plantId: plantId ?? null },
        fetchPolicy: 'network-only',
      }).then(r => (r.data?.plantReminders ?? []).map(mapReminder))
    );
  }

  set(plantId: string, actionType: ReminderActionType, intervalDays: number, enabled: boolean, notifyTime?: string | null): Observable<PlantReminder> {
    return defer(() =>
      this.client.mutate<{ setPlantReminder: RawReminder }>({
        mutation: SET_REMINDER,
        variables: { plantId, actionType, intervalDays, enabled, notifyTime: notifyTime ?? null },
      }).then(r => mapReminder(r.data!.setPlantReminder))
    );
  }

  remove(id: string): Observable<boolean> {
    return defer(() =>
      this.client.mutate<{ removePlantReminder: boolean }>({
        mutation: REMOVE_REMINDER,
        variables: { id },
      }).then(() => true)
    );
  }

  snooze(id: string, hours = 24): Observable<PlantReminder> {
    return defer(() =>
      this.client.mutate<{ snoozeReminder: RawReminder }>({
        mutation: SNOOZE_REMINDER,
        variables: { id, hours },
      }).then(r => mapReminder(r.data!.snoozeReminder))
    );
  }

  /** A reminder is "due" if nextDueAt is in the past and not currently snoozed. */
  static isDue(r: PlantReminder, now: Date = new Date()): boolean {
    if (!r.enabled) return false;
    if (r.nextDueAt.getTime() > now.getTime()) return false;
    if (r.snoozedUntil && r.snoozedUntil.getTime() > now.getTime()) return false;
    return true;
  }
}
