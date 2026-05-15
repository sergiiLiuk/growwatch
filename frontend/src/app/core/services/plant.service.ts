import { Injectable, signal } from '@angular/core';
import { ApolloClient, gql } from '@apollo/client/core';
import { Observable } from 'rxjs';
import { GraphQLClientService } from './graphql-client.service';

export type PlantType =
  | 'TOMATO' | 'PEPPER' | 'CUCUMBER' | 'ZUCCHINI' | 'EGGPLANT'
  | 'LETTUCE' | 'SPINACH' | 'KALE' | 'ARUGULA' | 'RADISH'
  | 'BASIL' | 'MINT' | 'PARSLEY' | 'CILANTRO' | 'CHIVE'
  | 'OREGANO' | 'THYME' | 'ROSEMARY' | 'STRAWBERRY';

export interface PlantTypeOption {
  value: PlantType;
  label: string;
  group: string;
}

export const PLANT_TYPE_OPTIONS: PlantTypeOption[] = [
  { value: 'TOMATO',     label: 'Tomato',      group: 'Fruiting vegetables' },
  { value: 'PEPPER',     label: 'Pepper',      group: 'Fruiting vegetables' },
  { value: 'CUCUMBER',   label: 'Cucumber',    group: 'Fruiting vegetables' },
  { value: 'ZUCCHINI',   label: 'Zucchini',    group: 'Fruiting vegetables' },
  { value: 'EGGPLANT',   label: 'Eggplant',    group: 'Fruiting vegetables' },
  { value: 'LETTUCE',    label: 'Lettuce',      group: 'Leafy greens' },
  { value: 'SPINACH',    label: 'Spinach',      group: 'Leafy greens' },
  { value: 'KALE',       label: 'Kale',         group: 'Leafy greens' },
  { value: 'ARUGULA',    label: 'Arugula',      group: 'Leafy greens' },
  { value: 'RADISH',     label: 'Radish',       group: 'Leafy greens' },
  { value: 'BASIL',      label: 'Basil',        group: 'Herbs' },
  { value: 'MINT',       label: 'Mint',         group: 'Herbs' },
  { value: 'PARSLEY',    label: 'Parsley',      group: 'Herbs' },
  { value: 'CILANTRO',   label: 'Cilantro',     group: 'Herbs' },
  { value: 'CHIVE',      label: 'Chive',        group: 'Herbs' },
  { value: 'OREGANO',    label: 'Oregano',      group: 'Herbs' },
  { value: 'THYME',      label: 'Thyme',        group: 'Herbs' },
  { value: 'ROSEMARY',   label: 'Rosemary',     group: 'Herbs' },
  { value: 'STRAWBERRY', label: 'Strawberry',   group: 'Fruit' },
];

export interface Plant {
  id: string;
  name: string;
  type: PlantType;
  plantedDate: Date;
  count: number;
  monitored: boolean;
  dailyLightHours: number;
}

const PLANTS_QUERY = gql`
  query GetPlants {
    plants { id name type plantedDate count monitored dailyLightHours }
  }
`;

const SET_MONITORED = gql`
  mutation SetPlantMonitored($id: String!, $monitored: Boolean!) {
    setPlantMonitored(id: $id, monitored: $monitored) {
      id name type plantedDate count monitored dailyLightHours
    }
  }
`;

const ADD_PLANT = gql`
  mutation AddPlant($name: String!, $type: PlantType!, $plantedDate: String!, $count: Int!, $dailyLightHours: Int) {
    addPlant(name: $name, type: $type, plantedDate: $plantedDate, count: $count, dailyLightHours: $dailyLightHours) {
      id name type plantedDate count monitored dailyLightHours
    }
  }
`;

const UPDATE_PLANT = gql`
  mutation UpdatePlant($id: String!, $name: String!, $type: PlantType!, $plantedDate: String!, $count: Int!, $dailyLightHours: Int) {
    updatePlant(id: $id, name: $name, type: $type, plantedDate: $plantedDate, count: $count, dailyLightHours: $dailyLightHours) {
      id name type plantedDate count monitored dailyLightHours
    }
  }
`;

const REMOVE_PLANT = gql`
  mutation RemovePlant($id: String!) {
    removePlant(id: $id)
  }
`;

interface RawPlant { id: string; name: string; type: string; plantedDate: string; count: number; monitored: boolean; dailyLightHours: number; }

@Injectable({ providedIn: 'root' })
export class PlantService {
  private client: ApolloClient;
  plants = signal<Plant[]>([]);
  plantsLoading = signal(true);

  constructor(gqlClient: GraphQLClientService) {
    this.client = gqlClient.client;
    this.loadPlants();
  }

  private loadPlants() {
    this.client
      .query<{ plants: RawPlant[] }>({ query: PLANTS_QUERY, fetchPolicy: 'network-only' })
      .then(result => this.plants.set(this.mapPlants(result.data?.plants ?? [])))
      .catch(err => console.error('Failed to load plants:', err))
      .finally(() => this.plantsLoading.set(false));
  }

  private mapPlants(raw: RawPlant[]): Plant[] {
    return raw.map(p => ({ ...p, type: p.type as PlantType, plantedDate: new Date(p.plantedDate), count: p.count ?? 1, monitored: p.monitored ?? true, dailyLightHours: p.dailyLightHours ?? 12 }));
  }

  add(name: string, type: PlantType, plantedDate: Date, count: number, dailyLightHours = 12): Observable<Plant> {
    return new Observable(observer => {
      this.client
        .mutate<{ addPlant: RawPlant }>({
          mutation: ADD_PLANT,
          variables: { name: name.trim(), type: type.trim(), plantedDate: plantedDate.toISOString(), count, dailyLightHours },
        })
        .then(result => {
          const mapped = this.mapPlants([result.data!.addPlant])[0];
          this.plants.update(ps => [...ps, mapped]);
          observer.next(mapped);
          observer.complete();
        })
        .catch(err => observer.error(err));
    });
  }

  update(id: string, name: string, type: PlantType, plantedDate: Date, count: number, dailyLightHours = 12): Observable<Plant> {
    return new Observable(observer => {
      this.client
        .mutate<{ updatePlant: RawPlant }>({
          mutation: UPDATE_PLANT,
          variables: { id, name: name.trim(), type, plantedDate: plantedDate.toISOString(), count, dailyLightHours },
        })
        .then(result => {
          const mapped = this.mapPlants([result.data!.updatePlant])[0];
          this.plants.update(ps => ps.map(p => p.id === id ? mapped : p));
          observer.next(mapped);
          observer.complete();
        })
        .catch(err => observer.error(err));
    });
  }

  remove(id: string): Observable<boolean> {
    return new Observable(observer => {
      this.client
        .mutate<{ removePlant: boolean }>({
          mutation: REMOVE_PLANT,
          variables: { id },
        })
        .then(() => {
          this.plants.update(ps => ps.filter(p => p.id !== id));
          observer.next(true);
          observer.complete();
        })
        .catch(err => observer.error(err));
    });
  }

  setMonitored(id: string, monitored: boolean): Observable<Plant> {
    return new Observable(observer => {
      this.client
        .mutate<{ setPlantMonitored: RawPlant }>({
          mutation: SET_MONITORED,
          variables: { id, monitored },
        })
        .then(result => {
          const mapped = this.mapPlants([result.data!.setPlantMonitored])[0];
          this.plants.update(ps => ps.map(p => p.id === id ? mapped : p));
          observer.next(mapped);
          observer.complete();
        })
        .catch(err => observer.error(err));
    });
  }

  getAgeLabel(plant: Plant): string {
    const days = Math.floor((Date.now() - plant.plantedDate.getTime()) / 86400000);
    if (days < 7) return `${days} day${days !== 1 ? 's' : ''} old`;
    const weeks = Math.floor(days / 7);
    if (weeks < 8) return `${weeks} week${weeks !== 1 ? 's' : ''} old`;
    const months = Math.floor(days / 30);
    return `${months} month${months !== 1 ? 's' : ''} old`;
  }
}
