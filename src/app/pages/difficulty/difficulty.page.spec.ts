import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DifficultyPage } from './difficulty.page';

describe('DifficultyPage', () => {
  let component: DifficultyPage;
  let fixture: ComponentFixture<DifficultyPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(DifficultyPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
