import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type CategorySuggestionStatus = 'pending' | 'approved' | 'rejected';

export interface CategorySuggestion {
  id: string;
  label: string;
  status: CategorySuggestionStatus;
  entity_id: string | null;
  entity_name: string | null;
  suggested_by_name: string | null;
  suggested_by_email: string | null;
  reviewed_by_name: string | null;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface CategorySuggestionList {
  suggestions: CategorySuggestion[];
  counts: Record<CategorySuggestionStatus, number>;
}

/** Category suggestions (backend migration 086). Review never changes the official list. */
@Injectable({ providedIn: 'root' })
export class CategorySuggestionsService {
  private http = inject(HttpClient);

  private headers(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
  }

  suggest(label: string, entityId?: string | null) {
    return this.http.post<{ duplicate: boolean; suggestion: Pick<CategorySuggestion, 'id' | 'label' | 'status'> }>(
      `${environment.apiUrl}/api/category-suggestions`,
      entityId ? { label, entityId } : { label },
      { headers: this.headers() },
    );
  }

  list(status?: CategorySuggestionStatus) {
    const params = status ? new HttpParams().set('status', status) : undefined;
    return this.http.get<CategorySuggestionList>(`${environment.apiUrl}/api/platform/category-suggestions`, { headers: this.headers(), params });
  }

  review(id: string, decision: 'approve' | 'reject', note?: string) {
    return this.http.post<{ suggestion: CategorySuggestion }>(
      `${environment.apiUrl}/api/platform/category-suggestions/${id}/${decision}`,
      note ? { note } : {},
      { headers: this.headers() },
    );
  }
}
