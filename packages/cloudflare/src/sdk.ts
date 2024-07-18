import {
  dedupeIntegration,
  functionToStringIntegration,
  getIntegrationsToSetup,
  inboundFiltersIntegration,
  initAndBind,
  linkedErrorsIntegration,
  requestDataIntegration,
} from '@sentry/core';
import type { Client, Integration, Options } from '@sentry/types';
import { createStackParser, nodeStackLineParser, stackParserFromStackParserOptions } from '@sentry/utils';

import { setAsyncLocalStorageAsyncContextStrategy } from './async';
import type { CloudflareClientOptions, CloudflareOptions } from './client';
import { CloudflareClient } from './client';
import { fetchIntegration } from './integrations/fetch';
import { makeCloudflareTransport } from './transport';

const nodeStackParser = createStackParser(nodeStackLineParser());

/** Get the default integrations for the Cloudflare SDK. */
export function getDefaultIntegrations(options: Options): Integration[] {
  const integrations = [
    dedupeIntegration(),
    inboundFiltersIntegration(),
    functionToStringIntegration(),
    linkedErrorsIntegration(),
    fetchIntegration(),
  ];

  if (options.sendDefaultPii) {
    integrations.push(requestDataIntegration());
  }

  return integrations;
}

/**
 * Initializes the Cloudflare SDK.
 *
 * Please note that this method requires the usage of `AsyncLocalStorage` so you will need to have
 * the `compatibility_flags = ["nodejs_compat"]` or `compatibility_flags = ["nodejs_als"]` set in your
 * `wrangler.toml` file.
 *
 * @param options Init options for the Cloudflare SDK.
 * @returns The initialized SDK client, or `undefined` if the SDK could not be initialized.
 */
export function init(options: CloudflareOptions = {}): Client | undefined {
  setAsyncLocalStorageAsyncContextStrategy();

  const clientOptions: CloudflareClientOptions = {
    ...options,
    stackParser: stackParserFromStackParserOptions(options.stackParser || nodeStackParser),
    integrations: getIntegrationsToSetup(options),
    transport: options.transport || makeCloudflareTransport,
  };

  return initAndBind(CloudflareClient, clientOptions);
}
