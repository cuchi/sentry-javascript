import {
  Envelope,
  InternalBaseTransportOptions,
  Transport,
  TransportCategory,
  TransportRequest,
  TransportRequestExecutor,
  TransportResponse,
} from '@sentry/types';
import {
  disabledUntil,
  eventStatusFromHttpCode,
  getEnvelopeType,
  isRateLimited,
  makePromiseBuffer,
  PromiseBuffer,
  RateLimits,
  rejectedSyncPromise,
  resolvedSyncPromise,
  serializeEnvelope,
  updateRateLimits,
} from '@sentry/utils';

export const DEFAULT_TRANSPORT_BUFFER_SIZE = 30;

/**
 * Creates an instance of a Sentry `Transport`
 *
 * @param options
 * @param makeRequest
 */
export function createTransport(
  options: InternalBaseTransportOptions,
  makeRequest: TransportRequestExecutor,
  buffer: PromiseBuffer<TransportResponse> = makePromiseBuffer(options.bufferSize || DEFAULT_TRANSPORT_BUFFER_SIZE),
): Transport {
  let rateLimits: RateLimits = {};

  const flush = (timeout?: number): PromiseLike<boolean> => buffer.drain(timeout);

  function send(envelope: Envelope): PromiseLike<TransportResponse> {
    const envCategory = getEnvelopeType(envelope);
    const category = envCategory === 'event' ? 'error' : (envCategory as TransportCategory);
    const request: TransportRequest = {
      category,
      body: serializeEnvelope(envelope),
    };

    // Don't add to buffer if transport is already rate-limited
    if (isRateLimited(rateLimits, category)) {
      return rejectedSyncPromise({
        status: 'rate_limit',
        reason: getRateLimitReason(rateLimits, category),
      });
    }

    const requestTask = (): PromiseLike<TransportResponse> =>
      makeRequest(request).then(({ body, headers, reason, statusCode }): PromiseLike<TransportResponse> => {
        const status = eventStatusFromHttpCode(statusCode);
        if (headers) {
          rateLimits = updateRateLimits(rateLimits, headers);
        }
        if (status === 'success') {
          return resolvedSyncPromise({ status, reason });
        }
        return rejectedSyncPromise({
          status,
          reason:
            reason ||
            body ||
            (status === 'rate_limit' ? getRateLimitReason(rateLimits, category) : 'Unknown transport error'),
        });
      });

    return buffer.add(requestTask);
  }

  return {
    send,
    flush,
  };
}

function getRateLimitReason(rateLimits: RateLimits, category: TransportCategory): string {
  return `Too many ${category} requests, backing off until: ${new Date(
    disabledUntil(rateLimits, category),
  ).toISOString()}`;
}
