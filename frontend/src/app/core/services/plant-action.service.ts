import { Injectable } from '@angular/core';
import { ApolloClient, gql } from '@apollo/client/core';
import { Observable } from 'rxjs';
import { GraphQLClientService } from './graphql-client.service';

export type PlantActionType = 'water' | 'fertilize' | 'prune' | 'harvest' | 'bloom' | 'note';

export interface PlantAction {
  id: string;
  plantId: string;
  type: PlantActionType;
  note: string | null;
  createdAt: Date;
}

export interface SmartTip {
  id: string;
  plantId: string;
  text: string;
  source: string;
  cycle: 'morning' | 'evening' | null;
  generatedAt: Date;
}

const ACTIONS_QUERY = gql`
  query PlantActions($plantId: String!, $limit: Int) {
    plantActions(plantId: $plantId, limit: $limit) {
      id plantId type note createdAt
    }
  }
`;

const LOG_ACTION = gql`
  mutation LogPlantAction($plantId: String!, $type: PlantActionType!, $note: String) {
    logPlantAction(plantId: $plantId, type: $type, note: $note) {
      id plantId type note createdAt
    }
  }
`;

const REMOVE_ACTION = gql`
  mutation RemovePlantAction($id: String!) {
    removePlantAction(id: $id)
  }
`;

const SMART_TIP_QUERY = gql`
  query SmartTip($plantId: String!) {
    smartTip(plantId: $plantId) {
      id plantId text source cycle generatedAt
    }
  }
`;

const DAILY_BRIEFING_QUERY = gql`
  query DailyBriefing {
    dailyBriefing { id cycle overview source generatedAt }
  }
`;

const REGENERATE_BRIEFING = gql`
  mutation RegenerateBriefing {
    regenerateBriefing { id cycle overview source generatedAt }
  }
`;

interface RawAction { id: string; plantId: string; type: PlantActionType; note: string | null; createdAt: string; }
interface RawTip { id: string; plantId: string; text: string; source: string; cycle: 'morning' | 'evening' | null; generatedAt: string; }
interface RawBriefing { id: string; cycle: 'morning' | 'evening'; overview: string; source: string; generatedAt: string; }

export interface DailyBriefing { id: string; cycle: 'morning' | 'evening'; overview: string; source: string; generatedAt: Date; }
function mapBriefing(r: RawBriefing): DailyBriefing { return { ...r, generatedAt: new Date(r.generatedAt) }; }

function mapAction(r: RawAction): PlantAction {
  return { ...r, createdAt: new Date(r.createdAt) };
}

function mapTip(r: RawTip): SmartTip {
  return { ...r, generatedAt: new Date(r.generatedAt) };
}

@Injectable({ providedIn: 'root' })
export class PlantActionService {
  private client: ApolloClient;

  constructor(gql: GraphQLClientService) {
    this.client = gql.client;
  }

  list(plantId: string, limit = 100): Observable<PlantAction[]> {
    return new Observable(observer => {
      this.client
        .query<{ plantActions: RawAction[] }>({
          query: ACTIONS_QUERY,
          variables: { plantId, limit },
          fetchPolicy: 'network-only',
        })
        .then(r => {
          observer.next((r.data?.plantActions ?? []).map(mapAction));
          observer.complete();
        })
        .catch(err => observer.error(err));
    });
  }

  log(plantId: string, type: PlantActionType, note?: string): Observable<PlantAction> {
    return new Observable(observer => {
      this.client
        .mutate<{ logPlantAction: RawAction }>({
          mutation: LOG_ACTION,
          variables: { plantId, type, note: note ?? null },
        })
        .then(r => {
          observer.next(mapAction(r.data!.logPlantAction));
          observer.complete();
        })
        .catch(err => observer.error(err));
    });
  }

  remove(id: string): Observable<boolean> {
    return new Observable(observer => {
      this.client
        .mutate<{ removePlantAction: boolean }>({
          mutation: REMOVE_ACTION,
          variables: { id },
        })
        .then(() => { observer.next(true); observer.complete(); })
        .catch(err => observer.error(err));
    });
  }

  getSmartTip(plantId: string): Observable<SmartTip | null> {
    return new Observable(observer => {
      this.client
        .query<{ smartTip: RawTip | null }>({
          query: SMART_TIP_QUERY,
          variables: { plantId },
          fetchPolicy: 'network-only',
        })
        .then(r => {
          observer.next(r.data?.smartTip ? mapTip(r.data.smartTip) : null);
          observer.complete();
        })
        .catch(err => observer.error(err));
    });
  }

  getDailyBriefing(): Observable<DailyBriefing | null> {
    return new Observable(observer => {
      this.client
        .query<{ dailyBriefing: RawBriefing | null }>({
          query: DAILY_BRIEFING_QUERY,
          fetchPolicy: 'network-only',
        })
        .then(r => {
          observer.next(r.data?.dailyBriefing ? mapBriefing(r.data.dailyBriefing) : null);
          observer.complete();
        })
        .catch(err => observer.error(err));
    });
  }

  regenerateBriefing(): Observable<DailyBriefing | null> {
    return new Observable(observer => {
      this.client
        .mutate<{ regenerateBriefing: RawBriefing | null }>({
          mutation: REGENERATE_BRIEFING,
        })
        .then(r => {
          observer.next(r.data?.regenerateBriefing ? mapBriefing(r.data.regenerateBriefing) : null);
          observer.complete();
        })
        .catch(err => observer.error(err));
    });
  }
}
