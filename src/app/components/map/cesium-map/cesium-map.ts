import {
    AfterViewInit,
    Component,
    OnDestroy,
    effect,
    inject
} from '@angular/core';


import { CesiumEntityRendererService } from '../../../services/cesium-entity-renderer.service';
import { AssetFactory } from '../../../core/asset-library/factories/asset-factory';
import * as Cesium from 'cesium';
import { MapSyncService, MapView } from '../../../services/map-sync.service';
import { FilterService } from '../../../services/filter.service';
import { SimulationService } from '../../../services/simulation.service';
import { EntityService } from '../../../services/entity.service';
import { AssetSelectionService } from '../../../services/asset-selection.service';
import { EntityRenderService } from '../../../core/rendering/entity-render.service';
import { Entity } from '../../../core/models/Entity';
import { Team } from '../../../core/enums/Team';

@Component({
    selector: 'app-cesium-map',
    standalone: true,
    templateUrl: './cesium-map.html',
    styleUrl: './cesium-map.css'
})

export class CesiumMapComponent implements AfterViewInit, OnDestroy {

    private viewer!: Cesium.Viewer;

    private entityService = inject(EntityService);
    private simulationService = inject(SimulationService);
    private mapSyncService = inject(MapSyncService);

    private cesiumRenderer = inject(CesiumEntityRendererService);
    private assetSelectionService = inject(AssetSelectionService);
    private filterService = inject(FilterService);
    private syncing = false;
    private lastEmittedCamera: MapView | null = null;
    private cesiumSyncFrame: number | null = null;
    private lastCesiumEmitAt = 0;
    private readonly cesiumEmitThrottleMs = 75;

    private tooltip: HTMLElement | null = null;
    private hoverHandler: Cesium.ScreenSpaceEventHandler | null = null;

    constructor() {
        effect(() => {

    this.entityService.entities();

    this.filterService.filters();
    this.filterService.teamFilters();
    this.filterService.teamHighlights();

    if (this.viewer) {

        this.viewer.entities.removeAll();

        this.drawEntities();

    }

});


        // Resize handler
        effect(() => {
            this.simulationService.panelMode();
            if (this.viewer) {
                setTimeout(() => {
                    this.viewer.resize();
                    this.viewer.scene.requestRender();
                }, 50);
            }
        });
    }

    ngAfterViewInit(): void {
        Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIzY2ZiMTI4MC0yODcxLTRhN2MtYTVmNi01MmFlYThjMzllODIiLCJpZCI6NDQyMjYxLCJzdWIiOiJIYXJzaW1hcjA4IiwiaXNzIjoiaHR0cHM6Ly9hcGkuY2VzaXVtLmNvbSIsImF1ZCI6IlVudGl0bGVkIiwiaWF0IjoxNzgyODAxMjQwfQ.FCFiKY8xR6oixiTfcg9AaQLL3Xb4IidcE-9aInSeQ88";

        this.viewer = new Cesium.Viewer("cesiumContainer", {
            terrain: Cesium.Terrain.fromWorldTerrain(),
            animation: false,
            timeline: false,
            homeButton: true,
            sceneModePicker: true,
            baseLayerPicker: true,
            navigationHelpButton: false,
            geocoder: false,
        });

        const initialView = this.mapSyncService.camera$.value;

        this.viewer.camera.setView({
            destination: Cesium.Cartesian3.fromDegrees(
                initialView.longitude,
                initialView.latitude,
                initialView.height
            ),
            orientation: {
                heading: Cesium.Math.toRadians(0),
                pitch: Cesium.Math.toRadians(-90),
                roll: 0
            }
        });

        const controller = this.viewer.scene.screenSpaceCameraController;
        controller.minimumZoomDistance = 200;
        controller.maximumZoomDistance = 20000000;

        this.tooltip = document.getElementById('cesiumTooltip');

        this.initializeClickHandler();
        this.initializeSelectionHandler();
        this.initializeHoverHandler();

        this.initializeSynchronization();
        this.initializeCameraSync();

        this.drawEntities();
    }

    private initializeSynchronization(): void {
        this.mapSyncService.camera$.subscribe(camera => {
            if (camera.source === 'cesium') {
                return;
            }
            this.scheduleCesiumSync(camera);
        });
    }

    private scheduleCesiumSync(camera: MapView): void {
        this.syncing = true;

        this.viewer.camera.setView({
            destination: Cesium.Cartesian3.fromDegrees(
                camera.longitude,
                camera.latitude,
                camera.height
            ),
            orientation: {
                heading: Cesium.Math.toRadians(0),
                pitch: Cesium.Math.toRadians(-90),
                roll: 0
            }
        });

        this.syncing = false;
    }

    private highlightTeam(team: Team | string): void {

    this.viewer.entities.values.forEach(entity => {

        if (!entity.billboard) {
            return;
        }

        const entityTeam = entity.properties?.['team']?.getValue(
    Cesium.JulianDate.now()
);

        if (entityTeam === team) {

           entity.billboard.color = new Cesium.ConstantProperty(
    Cesium.Color.YELLOW
);

        } else {

           
entity.billboard.color = new Cesium.ConstantProperty(
    Cesium.Color.WHITE
);
        }

    });

}

    private initializeCameraSync(): void {
        this.viewer.camera.moveStart.addEventListener(() => {
            this.startCesiumCameraLoop();
        });

        this.viewer.camera.moveEnd.addEventListener(() => {
            this.stopCesiumCameraLoop();
        });

        this.viewer.camera.changed.addEventListener(() => {
            if (this.syncing) return;
            this.queueCesiumCameraEmit();
        });
    }

    private startCesiumCameraLoop(): void {
        if (this.cesiumSyncFrame !== null) {
            return;
        }

        const tick = () => {
            if (!this.viewer || this.syncing) {
                this.cesiumSyncFrame = null;
                return;
            }

            this.emitCesiumCamera();
            this.cesiumSyncFrame = window.requestAnimationFrame(tick);
        };

        this.cesiumSyncFrame = window.requestAnimationFrame(tick);
    }

    private stopCesiumCameraLoop(): void {
        if (this.cesiumSyncFrame !== null) {
            window.cancelAnimationFrame(this.cesiumSyncFrame);
            this.cesiumSyncFrame = null;
        }

        this.emitCesiumCamera();
    }

    private queueCesiumCameraEmit(): void {
        if (this.cesiumSyncFrame !== null || this.syncing) {
            return;
        }

        this.cesiumSyncFrame = window.requestAnimationFrame(() => {
            this.cesiumSyncFrame = null;
            this.emitCesiumCamera();
        });
    }

    private emitCesiumCamera(): void {
        const now = Date.now();
        if (now - this.lastCesiumEmitAt < this.cesiumEmitThrottleMs) {
            return;
        }

        this.lastCesiumEmitAt = now;

        const cameraPosition = this.viewer.camera.positionCartographic;
        const height = cameraPosition.height;
        const lat = Cesium.Math.toDegrees(cameraPosition.latitude);
        const lng = Cesium.Math.toDegrees(cameraPosition.longitude);

        const nextCamera: MapView = {
            latitude: lat,
            longitude: lng,
            height,
            zoom: this.getZoomFromHeight(height),
            source: 'cesium'
        };

        if (this.isSameView(nextCamera, this.lastEmittedCamera)) {
            return;
        }

        this.lastEmittedCamera = nextCamera;
        this.mapSyncService.camera$.next(nextCamera);
    }

    private getZoomFromHeight(height: number): number {
        const latitude = Cesium.Math.toDegrees(this.viewer.camera.positionCartographic.latitude);
        const viewportHeight = this.viewer.canvas.clientHeight || 600;

        return this.mapSyncService.getZoomFromHeight(height, latitude, viewportHeight);
    }

    private isSameView(a: MapView, b: MapView | null): boolean {
        if (!b) return false;
        const latDiff = Math.abs(a.latitude - b.latitude);
        const lngDiff = Math.abs(a.longitude - b.longitude);
        const heightDiff = Math.abs(a.height - b.height);
        const zoomDiff = Math.abs((a.zoom ?? 0) - (b.zoom ?? 0));
        return latDiff < 0.00005 && lngDiff < 0.00005 && heightDiff < 1 && zoomDiff < 0.01;
    }

    private initializeClickHandler(): void {
        const handler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);

        handler.setInputAction((click: any) => {
            const picked = this.viewer.scene.pick(click.position);
            if (Cesium.defined(picked)) return;

            const ray = this.viewer.camera.getPickRay(click.position);
            if (!ray) return;

            const cartesian = this.viewer.scene.globe.pick(ray, this.viewer.scene);
            if (!cartesian) return;

            const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
            const latitude = Cesium.Math.toDegrees(cartographic.latitude);
            const longitude = Cesium.Math.toDegrees(cartographic.longitude);

            const asset = this.assetSelectionService.selectedAsset();
            if (asset && this.assetSelectionService.placing()) {
                this.placeAsset(asset, latitude, longitude);
                this.assetSelectionService.clear();
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    private initializeSelectionHandler(): void {
        const handler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);

        handler.setInputAction((click: any) => {
            const picked = this.viewer.scene.pick(click.position);
            if (!Cesium.defined(picked)) {
                this.simulationService.selectEntity(null);
                return;
            }

            const pickedEntity = picked.id as Cesium.Entity;
            const entityId = pickedEntity.id?.toString();
            if (!entityId) return;

            const entity = this.entityService.entities().find(e => e.id === entityId);
            if (entity) this.simulationService.selectEntity(entity);
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    private initializeHoverHandler(): void {
        this.hoverHandler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);

        this.hoverHandler.setInputAction((movement: any) => {
            const picked = this.viewer.scene.pick(movement.endPosition);
            if (!Cesium.defined(picked) || !picked.id) {
                this.hideTooltip();
                return;
            }

            const pickedEntity = picked.id as Cesium.Entity;
            const entityId = pickedEntity.id?.toString();
            if (!entityId) {
                this.hideTooltip();
                return;
            }

            const entity = this.entityService.entities().find(e => e.id === entityId);
            if (!entity) {
                this.hideTooltip();
                return;
            }

            this.showTooltip(entity, movement.endPosition);
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    }

    private showTooltip(entity: Entity, position: Cesium.Cartesian2): void {
        if (!this.tooltip) return;

        const rect = this.viewer.container.getBoundingClientRect();
        const left = rect.left + position.x + 12;
        const top = rect.top + position.y + 12;

        const lines: string[] = [];
        lines.push(`<div><strong>${entity.name}</strong></div>`);
        lines.push(`<div>Lat: ${entity.position.latitude.toFixed(6)}</div>`);
        lines.push(`<div>Lng: ${entity.position.longitude.toFixed(6)}</div>`);

        if (entity.properties) {
            for (const [key, value] of Object.entries(entity.properties)) {
                lines.push(`<div>${key}: ${value}</div>`);
            }
        }

        this.tooltip.innerHTML = lines.join('');
        this.tooltip.style.left = `${left}px`;
        this.tooltip.style.top = `${top}px`;
        this.tooltip.classList.remove('hidden');
    }

    private hideTooltip(): void {
        if (!this.tooltip) return;
        this.tooltip.classList.add('hidden');
    }

    private placeAsset(asset: any, lat: number, lng: number): void {
        const selectedTeam = this.filterService.getSelectedTeam();

        const entity = AssetFactory.create(asset, lat, lng, selectedTeam);
        this.entityService.addEntity(entity);
        console.log('Placed:', entity);
    }

    private createRadarPolygon(latitude: number, longitude: number, radius: number): Cesium.Cartesian3[] {
        const positions: Cesium.Cartesian3[] = [];
        for (let angle = 0; angle <= 360; angle += 2) {
            const radians = Cesium.Math.toRadians(angle);
            const dLat = (radius * Math.cos(radians)) / 111320;
            const dLon = (radius * Math.sin(radians)) / (111320 * Math.cos(Cesium.Math.toRadians(latitude)));
            positions.push(Cesium.Cartesian3.fromDegrees(longitude + dLon, latitude + dLat));
        }
        return positions;
    }

    private drawEntity(entity: Entity): void {
        const highlighted = this.getEntityHighlightState(entity);
        this.cesiumRenderer.draw(this.viewer, entity, highlighted);
    }

    private drawEntities(): void {

    const entities = this.entityService.entities();

    for (const entity of entities) {

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

    private getEntityHighlightState(entity: Entity): boolean {
        return this.filterService.isTeamHighlighted(entity.team);
    }

    ngOnDestroy(): void {
        if (this.hoverHandler) {
            this.hoverHandler.destroy();
            this.hoverHandler = null;
        }
        if (this.viewer) {
            this.viewer.destroy();
        }
    }

}
