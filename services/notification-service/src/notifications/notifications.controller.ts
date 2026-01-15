import { Controller, Get, Param } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { Notification } from './entities/notification.entity';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async findAll(): Promise<Notification[]> {
    return this.notificationsService.findAll();
  }

  @Get('order/:orderId')
  async findByOrder(@Param('orderId') orderId: string): Promise<Notification[]> {
    return this.notificationsService.findByOrder(orderId);
  }
}
