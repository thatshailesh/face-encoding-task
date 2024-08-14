import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
	timestamps: true,
	collection: 'images-metadata'
})
export class ImageMetadata extends Document {
  	@Prop({ required: true})
  	sessionId: string;

	@Prop({ required: true})
  	imageUrl: string;

	@Prop({ required: true})
	filename: string;

	@Prop({ required: true })
	filetype: string;

	@Prop({ required: true})
	filesize: number;

	@Prop({ required: true})
	imageId: string;
}
export type ImageMetadataDocument = ImageMetadata & Document;
export const ImageMetadataSchema = SchemaFactory.createForClass(ImageMetadata);
ImageMetadataSchema.index({ sessionId: 1 })