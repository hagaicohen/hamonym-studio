import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EntityBillingSettingsEditComponent } from './entity-billing-settings-edit.component';

describe('EntityBillingSettingsEditComponent', () => {
  let component: EntityBillingSettingsEditComponent;
  let fixture: ComponentFixture<EntityBillingSettingsEditComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EntityBillingSettingsEditComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EntityBillingSettingsEditComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
