import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, route } = request;
    const path = route?.path || request.url;

    // Skip metrics endpoint to avoid recursion
    if (path === '/metrics') {
      return next.handle();
    }

    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          const statusCode = response.statusCode;
          const duration = (Date.now() - startTime) / 1000;

          this.metricsService.incrementHttpRequests(method, path, statusCode);
          this.metricsService.observeHttpDuration(method, path, statusCode, duration);
        },
        error: (error) => {
          const statusCode = error.status || 500;
          const duration = (Date.now() - startTime) / 1000;

          this.metricsService.incrementHttpRequests(method, path, statusCode);
          this.metricsService.observeHttpDuration(method, path, statusCode, duration);
        },
      }),
    );
  }
}
