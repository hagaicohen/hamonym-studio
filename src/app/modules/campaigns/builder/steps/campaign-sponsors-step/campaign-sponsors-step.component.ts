import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Handshake } from 'lucide-angular';
import { CampaignStudioStateService } from '../../../services/campaign-studio-state.service';

@Component({
  selector: 'app-campaign-sponsors-step',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './campaign-sponsors-step.component.html',
  styleUrl: './campaign-sponsors-step.component.css',
})
export class CampaignSponsorsStepComponent {
  private state = inject(CampaignStudioStateService);

  readonly HandshakeIcon = Handshake;

  draft$ = this.state.draft$;

  addSponsor(): void {
    const sponsors = [...this.state.draft.sponsors, {
      id: Math.random().toString(36).slice(2, 10),
      name: '',
      logoUrl: null,
      link: null,
    }];
    this.state.patch({ sponsors });
  }

  removeSponsor(id: string): void {
    this.state.patch({ sponsors: this.state.draft.sponsors.filter(s => s.id !== id) });
  }

  updateName(id: string, value: string): void {
    const sponsors = this.state.draft.sponsors.map(s =>
      s.id === id ? { ...s, name: value } : s
    );
    this.state.patch({ sponsors });
  }

  onLogoSelected(id: string, event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const sponsors = this.state.draft.sponsors.map(s =>
        s.id === id ? { ...s, logoUrl: reader.result as string } : s
      );
      this.state.patch({ sponsors });
    };
    reader.readAsDataURL(file);
  }

  removeLogo(id: string): void {
    const sponsors = this.state.draft.sponsors.map(s =>
      s.id === id ? { ...s, logoUrl: null } : s
    );
    this.state.patch({ sponsors });
  }
}
