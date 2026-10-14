/** Avaliações Google (Places): só leitura de dados públicos do Google + a ligação local → lugar. */

export interface PlaceLink {
  locationId: string;
  placeId: string;
  placeName: string;
}

export interface PlaceCandidate {
  placeId: string;
  name: string;
  address: string | null;
  rating: number | null;
  userRatingCount: number | null;
}

export interface PlaceSummary {
  placeId: string;
  name: string;
  rating: number | null;
  userRatingCount: number | null;
  googleMapsUri: string | null;
}

export interface PlaceReview {
  author: string;
  authorUri: string | null;
  rating: number | null;
  text: string | null;
  relativeTime: string | null;
  publishTime: string | null;
}

export interface LocationRating {
  locationId: string;
  locationName: string;
  placeId: string;
  placeName: string;
  rating: number | null;
  userRatingCount: number | null;
  googleMapsUri: string | null;
  /** O Google não respondeu agora (o resto continua). */
  unavailable: boolean;
}
