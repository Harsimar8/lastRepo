import {
  AfterViewInit,
  Component,
  effect
} from '@angular/core';

import * as L from 'leaflet';
import { EntityRenderService } from '../../../core/rendering/entity-render.service';
import { MapSyncService, MapView } from '../../../services/map-sync.service';
import { AssetSelectionService } from '../../../services/asset-selection.service';
import { SimulationService } from '../../../services/simulation.service';
import { EntityService } from '../../../services/entity.service';
import { AssetFactory } from '../../../core/asset-library/factories/asset-factory';
import { Entity } from '../../../core/models/Entity';
import { EntityType } from '../../../core/enums/EntityType';
import { Team } from '../../../core/enums/Team';
import { FilterService } from '../../../services/filter.service';

@Component({
  selector: 'app-leaflet-map',
  standalone: true,
  imports: [],
  templateUrl: './leaflet-map.html',
  styleUrl: './leaflet-map.css'
})
export class LeafletMap implements AfterViewInit {

  private map!: L.Map;
  private markers = L.layerGroup();
  private iconCache = new Map<string, L.Icon>();
  private syncing = false;
  private pendingCameraSync: MapView | null = null;
  private queuedCameraSync: MapView | null = null;
  private leafletSyncFrame: number | null = null;
  private pendingLeafletEmitFrame: number | null = null;

 
  constructor(
    public simulationService: SimulationService,
    private entityService: EntityService,
    private mapSyncService: MapSyncService,
    private assetSelectionService: AssetSelectionService,
    private renderService: EntityRenderService,
    private filterService: FilterService
) {
    // 1. React to entity changes
    effect(() => {

    this.entityService.entities();

    this.filterService.filters();
    this.filterService.teamFilters();
    this.filterService.teamHighlights();

    if (this.map) {

        this.redrawEntities();

    }

});

    // 2. Handle panel resize
    effect(() => {
      this.simulationService.panelMode();
      if (this.map) {
        setTimeout(() => this.map.invalidateSize(), 50);
      }
    });

    // 3. Sync from Cesium (with guard)
    
  }

  ngAfterViewInit(): void {
    this.initializeMap();
this.initializeTileLayer();
this.markers.addTo(this.map);

this.initializeSynchronization();

this.initializeClickHandler();
this.redrawEntities();
  }

  private initializeMap(): void {
    const initialView = this.mapSyncService.camera$.value;

    this.map = L.map('leaflet-map', {
      zoomSnap: 0,
      zoomDelta: 0.25
    }).setView(
      [initialView.latitude, initialView.longitude],
      initialView.zoom ?? this.getZoomFromHeight(initialView.height, initialView.latitude)
    );

    // Only emit to service on user-initiated events
     this.map.on('move', () => {
      if (this.syncing) {
        return;
      }
      if (this.pendingLeafletEmitFrame !== null) {
        return;
      }

      this.pendingLeafletEmitFrame = window.requestAnimationFrame(() => {
        this.pendingLeafletEmitFrame = null;
        const center = this.map.getCenter();
        const zoom = this.map.getZoom();

        this.mapSyncService.camera$.next({
          latitude: center.lat,
          longitude: center.lng,
          height: this.getCameraHeight(zoom),
          zoom,
          source: 'leaflet'
        });
      });
    });
  }

  private getCameraHeight(zoom: number): number {
    const center = this.map.getCenter();
    return this.mapSyncService.getHeightFromZoom(
      zoom,
      center.lat,
      this.map.getSize().y || 600
    );
}


  private initializeSynchronization(): void {
    this.mapSyncService.camera$.subscribe(camera => {
      if (camera.source === 'leaflet') {
        return;
      }

      if (this.syncing) {
        this.queuedCameraSync = camera;
        return;
      }

      this.scheduleCameraView(camera);
    });
  }

  private scheduleCameraView(camera: MapView): void {
    this.syncing = true;

    const targetZoom = camera.zoom ?? this.getZoomFromHeight(camera.height, camera.latitude);
    const currentCenter = this.map.getCenter();
    const zoomDiff = Math.abs(targetZoom - this.map.getZoom());
    const centerDiffLat = Math.abs(camera.latitude - currentCenter.lat);
    const centerDiffLng = Math.abs(camera.longitude - currentCenter.lng);

    if (centerDiffLat < 0.0002 && centerDiffLng < 0.0002 && zoomDiff < 0.05) {
      this.syncing = false;
      return;
    }

    if (zoomDiff < 0.1) {
      this.map.panTo([camera.latitude, camera.longitude], {
        animate: false
      });
    } else {
      this.map.setView(
        [camera.latitude, camera.longitude],
        targetZoom,
        {
          animate: false
        }
      );
    }

    this.syncing = false;
  }

private getZoomFromHeight(height: number, latitude: number): number {
    return this.mapSyncService.getZoomFromHeight(
      height,
      latitude,
      this.map.getSize().y || 600
    );
}
private getLeafletIcon(
    path: string,
    highlighted = false,
    team: Team
): L.DivIcon {

    const badge =
    team === Team.Blue
        ? "🔵"
        : team === Team.Red
        ? "🔴"
        : "⚪";

return L.divIcon({

    className: "",

    iconSize: highlighted ? [42, 42] : [32, 32],

    iconAnchor: highlighted ? [21, 21] : [16, 16],

    html: `
        <div style="position:relative; width:${highlighted ? 42 : 32}px; height:${highlighted ? 42 : 32}px;">

            <img
                src="${path}"
                style="
                    width:100%;
                    height:100%;
                ">

            <div
                style="
                    position:absolute;
                    top:34px;
                    right:-14px;
                    font-size:16px;
                ">
                ${badge}
            </div>

        </div>
    `

});

}

  private initializeTileLayer(): void {
  L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    {
      attribution: '&copy; OpenStreetMap &copy; CARTO'
    }
  ).addTo(this.map);
}

    private initializeClickHandler(): void {

  this.map.on('click', (event: L.LeafletMouseEvent) => {

   

const selectedAsset = this.assetSelectionService.selectedAsset();

if (this.assetSelectionService.placing() && selectedAsset) {

    this.placeAsset(
        selectedAsset,
        event.latlng.lat,
        event.latlng.lng
    );

    return;

}

    

  });

}
  
 

  private placeAsset(asset: any, lat: number, lng: number): void {

  const selectedTeam = this.filterService.getSelectedTeam();

  const entity = AssetFactory.create(
    asset,
    lat,
    lng,
    selectedTeam
  );

  this.entityService.addEntity(entity);

  console.log('Placed:', entity);
  this.simulationService.selectEntity(entity);

}

  private redrawEntities(): void {

    this.markers.clearLayers();

    for (const entity of this.entityService.entities()) {

        if (!this.filterService.isVisible(entity.type)) {
            continue;
        }

        if (!this.filterService.isTeamVisible(entity.team)) {
            continue;
        }

        this.drawEntity(entity);

    }

}

    private isAnyTeamHighlighted(): boolean {
        return Object.values(Team).some(team => this.filterService.isTeamHighlighted(team));
    }

    private getEntityHighlight(entity: Entity): boolean {
        return this.filterService.isTeamHighlighted(entity.team);
    }

    private drawEntity(entity: Entity): void {
        const style = this.renderService.getStyle(entity);
        const highlighted = this.getEntityHighlight(entity);

        let marker: L.Marker;

        if (style.icon) {
            marker = L.marker(
                [entity.position.latitude, entity.position.longitude],
                {
                    icon: this.getLeafletIcon(
    style.icon,
    highlighted,
    entity.team
)
                }
            );
        } else {
            marker = L.marker(
                [entity.position.latitude, entity.position.longitude],
                {
                    icon: L.divIcon({
                        html: `
                            <div style="
                                width:${highlighted ? 18 : 14}px;
                                height:${highlighted ? 18 : 14}px;
                                border-radius:50%;
                                background:${style.color};
                                border:2px solid white;
                                box-shadow:0 0 ${highlighted ? 8 : 5}px rgba(0,0,0,0.6);
                                opacity:1;
                            "></div>
                        `,
                        className: '',
                        iconSize: [highlighted ? 22 : 18, highlighted ? 22 : 18],
                        iconAnchor: [highlighted ? 11 : 9, highlighted ? 11 : 9]
                    })
                }
            );
        }

        if (style.showLabel) {
            const tooltipLines = [
                `Name: ${entity.name}`,
                `Lat: ${entity.position.latitude.toFixed(6)}`,
                `Lng: ${entity.position.longitude.toFixed(6)}`
            ];

            if (entity.properties) {
                for (const [key, value] of Object.entries(entity.properties)) {
                    tooltipLines.push(`${key}: ${value}`);
                }
            }

            marker.bindTooltip(tooltipLines.join('<br/>'), {
                permanent: false,
                direction: 'top',
                className: 'entity-tooltip'
            });
        }

        marker.on('click', () => {
            this.simulationService.selectEntity(entity);
        });


        marker.addTo(this.markers);

        if (entity.type === EntityType.RadarSite) {
            const searchRange = entity.properties?.['searchRange'];
            if (searchRange) {
                L.circle(
                    [entity.position.latitude, entity.position.longitude],
                    {
                        radius: searchRange,
                        color: 'red',
                        weight: 2,
                        fillColor: 'red',
                        fillOpacity: 0.2
                    }
                ).addTo(this.markers);
            }
        } else if (entity.type === EntityType.SamBattery) {
          const searchRange =
            entity.properties?.['searchRange'] ??
            Math.sqrt(entity.properties?.['engagementRangeSqr'] ?? 0);
          if (searchRange > 0) {
            L.circle(
              [entity.position.latitude, entity.position.longitude],
              {
                radius: searchRange,
                color: 'blue',
                weight: 2,
                fillColor: 'blue',
                fillOpacity: 0.15
              }
            ).addTo(this.markers);

            const rings = 5;
            for (let i = 1; i <= rings; i++) {
              L.circle(
                [entity.position.latitude, entity.position.longitude],
                {
                  radius: (searchRange / rings) * i,
                  color: 'blue',
                  weight: 1,
                  fill: false,
                  opacity: 0.8
                }
              ).addTo(this.markers);
            }
          }
        }
    }
}
  