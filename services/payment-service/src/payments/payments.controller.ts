import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { Payment } from './entities/payment.entity';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  async findAll(): Promise<Payment[]> {
    return this.paymentsService.findAll();
  }

  @Get('order/:orderId')
  async findByOrderId(@Param('orderId') orderId: string): Promise<Payment> {
    const payment = await this.paymentsService.findByOrderId(orderId);
    if (!payment) {
      throw new NotFoundException(`Payment for order ${orderId} not found`);
    }
    return payment;
  }
}
