import { Global, Module } from '@nestjs/common';
import { TokenCipherService } from './crypto/token-cipher.service.js';

@Global()
@Module({
  providers: [TokenCipherService],
  exports: [TokenCipherService],
})
export class CommonModule {}
