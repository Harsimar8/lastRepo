import { Component,computed } from '@angular/core';

import { SimulationService } from '../../services/simulation.service';
import { AssetLibraryService } from '../../core/asset-library/services/asset-library.service';
import { EditorTool } from '../../core/enums/EditorTool';
import { ViewMode } from '../../core/enums/ViewMode';
import { FilterService } from '../../services/filter.service';
import { EntityType } from '../../core/enums/EntityType';
import { Team } from '../../core/enums/Team';
import { ScenarioService } from '../../services/scenario.service';

@Component({
  selector: 'app-toolbar',
  standalone: true,
  imports: [],
  templateUrl: './toolbar.html',
  styleUrl: './toolbar.css'
})
export class Toolbar {

  EditorTool = EditorTool;
  ViewMode = ViewMode;

  constructor(
  public simulationService: SimulationService,
  public assetLibraryService: AssetLibraryService,
  public filterService: FilterService,
    public scenarioService: ScenarioService
) {

  const saved = localStorage.getItem('assetLibrary');

  if (saved) {

    this.assetLibraryService.setLibrary(
      JSON.parse(saved)
    );

  }

}
  categories = computed(() =>
    this.assetLibraryService.library()?.categories ?? []
);
showFilters = false;

entityTypes = Object.values(EntityType);


  onFileSelected(event: Event): void {

  const input = event.target as HTMLInputElement;

  if (!input.files?.length) {
    return;
  }

  const file = input.files[0];

  const reader = new FileReader();

  reader.onload = () => {

    try {

      const json = JSON.parse(reader.result as string);

      this.assetLibraryService.setLibrary(json);

      // Save permanently
      localStorage.setItem('assetLibrary', JSON.stringify(json));

      console.log("Library uploaded successfully.");

    }
    catch {

      alert("Invalid JSON");

    }

  };

  reader.readAsText(file);

}

   removeJson(): void {

    localStorage.removeItem('assetLibrary');

    this.assetLibraryService.setLibrary(null as any);

  }

  toggleFilters(): void {

  this.showFilters = !this.showFilters;

}

toggleEntityType(type: EntityType, event: Event): void {

    const checked = (event.target as HTMLInputElement).checked;

    this.filterService.setVisible(type, checked);

}


isBlueSelected(): boolean {
    return this.filterService.getSelectedTeam() === Team.Blue;
}

isRedSelected(): boolean {
    return this.filterService.getSelectedTeam() === Team.Red;
}

selectBlue(): void {
    this.filterService.setSelectedTeam(Team.Blue);
}

selectRed(): void {
    this.filterService.setSelectedTeam(Team.Red);
}
onScenarioSelected(event: Event): void {

    const input = event.target as HTMLInputElement;

    if (!input.files?.length) {
        return;
    }

    this.scenarioService.loadScenario(input.files[0]);

    input.value = '';

}
}