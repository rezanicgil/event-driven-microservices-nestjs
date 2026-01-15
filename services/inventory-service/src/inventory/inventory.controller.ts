import { Controller, Get, Param } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { Product } from './entities/product.entity';
import { Reservation } from './entities/reservation.entity';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('products')
  async findAllProducts(): Promise<Product[]> {
    return this.inventoryService.findAllProducts();
  }

  @Get('products/:id')
  async findProduct(@Param('id') id: string): Promise<Product> {
    return this.inventoryService.findProduct(id);
  }

  @Get('reservations/order/:orderId')
  async findReservationsByOrder(@Param('orderId') orderId: string): Promise<Reservation[]> {
    return this.inventoryService.findReservationsByOrder(orderId);
  }
}
