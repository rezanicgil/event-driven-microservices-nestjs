import { Injectable, OnModuleInit } from '@nestjs/common';
import * as client from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  private httpRequestsTotal: client.Counter;
  private httpRequestDuration: client.Histogram;
  private eventsPublishedTotal: client.Counter;

  onModuleInit() {
    client.collectDefaultMetrics({ prefix: 'order_service_' });

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

    this.eventsPublishedTotal = new client.Counter({
      name: 'events_published_total',
      help: 'Total number of events published',
      labelNames: ['event_type'],
    });
  }

  incrementHttpRequests(method: string, path: string, status: number) {
    this.httpRequestsTotal.inc({ method, path, status: status.toString() });
  }

  observeHttpDuration(method: string, path: string, status: number, duration: number) {
    this.httpRequestDuration.observe({ method, path, status: status.toString() }, duration);
  }

  incrementEventsPublished(eventType: string) {
    this.eventsPublishedTotal.inc({ event_type: eventType });
  }

  async getMetrics(): Promise<string> {
    return client.register.metrics();
  }

  getContentType(): string {
    return client.register.contentType;
  }
}
