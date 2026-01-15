import { Injectable, OnModuleInit } from '@nestjs/common';
import * as client from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  private httpRequestsTotal: client.Counter;
  private httpRequestDuration: client.Histogram;
  private eventsConsumedTotal: client.Counter;
  private eventsPublishedTotal: client.Counter;
  private eventProcessingDuration: client.Histogram;

  onModuleInit() {
    client.collectDefaultMetrics({ prefix: 'payment_service_' });

    this.httpRequestsTotal = new client.Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'path', 'status'],
    });

    this.httpRequestDuration = new client.Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'path', 'status'],
      buckets: [0.001, 0.005, 0.015, 0.05, 0.1, 0.5, 1, 5],
    });

    this.eventsConsumedTotal = new client.Counter({
      name: 'events_consumed_total',
      help: 'Total number of events consumed',
      labelNames: ['event_type'],
    });

    this.eventsPublishedTotal = new client.Counter({
      name: 'events_published_total',
      help: 'Total number of events published',
      labelNames: ['event_type'],
    });

    this.eventProcessingDuration = new client.Histogram({
      name: 'event_processing_duration_seconds',
      help: 'Duration of event processing in seconds',
      labelNames: ['event_type'],
      buckets: [0.001, 0.005, 0.015, 0.05, 0.1, 0.5, 1, 5],
    });
  }

  incrementHttpRequests(method: string, path: string, status: number) {
    this.httpRequestsTotal.inc({ method, path, status: status.toString() });
  }

  observeHttpDuration(method: string, path: string, status: number, duration: number) {
    this.httpRequestDuration.observe({ method, path, status: status.toString() }, duration);
  }

  incrementEventsConsumed(eventType: string) {
    this.eventsConsumedTotal.inc({ event_type: eventType });
  }

  incrementEventsPublished(eventType: string) {
    this.eventsPublishedTotal.inc({ event_type: eventType });
  }

  observeEventProcessing(eventType: string, duration: number) {
    this.eventProcessingDuration.observe({ event_type: eventType }, duration);
  }

  async getMetrics(): Promise<string> {
    return client.register.metrics();
  }

  getContentType(): string {
    return client.register.contentType;
  }
}
