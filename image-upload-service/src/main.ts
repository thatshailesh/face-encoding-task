import { NestFactory } from '@nestjs/core';
import { ImageModule } from './image.module';

async function bootstrap() {
  const app = await NestFactory.create(ImageModule);
  await app.listen(3000);
}
bootstrap();
