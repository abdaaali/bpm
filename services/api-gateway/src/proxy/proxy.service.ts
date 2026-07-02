import { Injectable, Logger, HttpException } from '@nestjs/common';
import axios, { AxiosRequestConfig } from 'axios';
import { KafkaProducerService } from '../kafka/kafka-producer.service';

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);

  constructor(private readonly kafkaProducer: KafkaProducerService) {}

  async forward(
    serviceUrl: string,
    method: string,
    path: string,
    body?: any,
    headers?: Record<string, string>,
    params?: any,
  ): Promise<any> {
    const url = `${serviceUrl}${path}`;
    const startTime = Date.now();
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const config: AxiosRequestConfig = {
      method: method as any,
      url,
      headers: { 'Content-Type': 'application/json', ...headers, 'X-Request-ID': requestId },
      params,
      data: body,
      timeout: 30000,
      validateStatus: () => true,
    };

    try {
      const response = await axios(config);
      const duration = Date.now() - startTime;

      this.kafkaProducer.produce('bpm.gateway.requests', {
        requestId, method, url, statusCode: response.status, duration,
        tenantId: headers?.['X-Tenant-ID'], timestamp: new Date().toISOString(),
      }).catch(() => {});

      if (response.status >= 400) {
        throw new HttpException(response.data || { message: 'Upstream error' }, response.status);
      }
      return response.data;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.error(`Proxy error ${method} ${url}: ${err.message}`);
      throw new HttpException({ message: 'Upstream service unavailable', error: err.message }, 502);
    }
  }
}
