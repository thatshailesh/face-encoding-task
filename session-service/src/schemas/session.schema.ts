import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ImagesMetadaInterface } from 'src/interfaces';
import { v1 as uuidv1 } from 'uuid';

@Schema({
    timestamps: true
})
export class Session extends Document {
    @Prop({ default: uuidv1 })
    sessionId: string;

    @Prop({ type: [Object], default: [] })
    imagesMetada: ImagesMetadaInterface[]
}

export const SessionSchema = SchemaFactory.createForClass(Session);
export type SessionDocument = Session & Document;
SessionSchema.index({ sessionId: 1 })