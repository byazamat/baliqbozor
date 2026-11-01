import { Module } from '@nestjs/common';

import { MatchingModule } from '../matching/matching.module.js';

import { CatalogService } from './catalog.service.js';
import { CatalogController, SellerListingsController } from './listings.controller.js';
import { ListingsService } from './listings.service.js';

@Module({
  imports: [MatchingModule],
  controllers: [CatalogController, SellerListingsController],
  providers: [ListingsService, CatalogService],
})
export class ListingsModule {}
