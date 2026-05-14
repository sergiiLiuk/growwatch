import { Injectable } from '@angular/core';
import { HttpLink } from 'apollo-angular/http';
import { ApolloClient, InMemoryCache, split } from '@apollo/client/core';
import { getMainDefinition } from '@apollo/client/utilities';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { createClient } from 'graphql-ws';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class GraphQLClientService {
  readonly client: ApolloClient;

  constructor(httpLink: HttpLink) {
    const wsLink = new GraphQLWsLink(
      createClient({ url: environment.backendWsUrl })
    );

    const http = httpLink.create({ uri: environment.backendHttpUrl });

    const link = split(
      ({ query }) => {
        const definition = getMainDefinition(query);
        return (
          definition.kind === 'OperationDefinition' &&
          definition.operation === 'subscription'
        );
      },
      wsLink,
      http
    );

    this.client = new ApolloClient({ link, cache: new InMemoryCache() });
  }
}
