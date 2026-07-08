import { Asset } from '../models/asset';

import { Entity } from '../../models/Entity';
import { Position } from '../../models/Position';

import { EntityType } from '../../enums/EntityType';
import { IdGenerator } from '../../utils/id-generator';
import { Team } from '../../enums/Team';

export class AssetFactory {

    static create(
        asset: Asset,
        latitude: number,
        longitude: number,
        team?: Team
    ): Entity {

        return new GenericEntity(

            IdGenerator.generate(asset.entityType),

            asset.name,

            asset.entityType as EntityType,

            new Position(
                latitude,
                longitude,
                asset.properties["altitude"] ?? 0
            ),

            asset.team ?? team ?? Team.Blue,

            { ...asset.properties }

        );

    }

}

class GenericEntity extends Entity {}