import { Injectable } from '@angular/core';
import { EntityService } from './entity.service';

@Injectable({
  providedIn: 'root'
})
export class ScenarioService {

  constructor(
    private entityService: EntityService
  ) {}

  saveScenario(): void {

    const entities = this.entityService.getEntities();

    const scenario = {

      name: "New Scenario",

      created: new Date().toISOString(),

      entities

    };

    const json = JSON.stringify(
      scenario,
      null,
      2
    );

    const blob = new Blob(
      [json],
      { type: 'application/json' }
    );

    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');

    a.href = url;

    a.download = 'scenario.json';

    a.click();

    URL.revokeObjectURL(url);

  }

}

