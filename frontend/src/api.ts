import type {
  AuthResponse,
  CampusLocation,
  DriverLocation,
  DriverDashboard,
  DriverSummary,
  Rating,
  Ride,
  User
} from './types';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export const sessionStore = {
  read(): AuthResponse | null {
    const raw = localStorage.getItem('ride-management-session');
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthResponse;
    } catch {
      localStorage.removeItem('ride-management-session');
      return null;
    }
  },
  write(session: AuthResponse) {
    localStorage.setItem('ride-management-session', JSON.stringify(session));
  },
  clear() {
    localStorage.removeItem('ride-management-session');
  }
};

async function request<T>(path: string, token?: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {})
    }
  });

  if (!response.ok) {
    let message = 'Request failed';
    try {
      const body = await response.json();
      message = body.message ?? message;
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export const api = {
  registerPassenger(payload: {
    name: string;
    email: string;
    password: string;
    phone: string;
    campusAddress?: string;
  }) {
    return request<AuthResponse>('/auth/register/passenger', undefined, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  registerDriver(payload: {
    name: string;
    email: string;
    password: string;
    phone: string;
    licenseNumber: string;
    verificationDocument: string;
    vehicleNumber: string;
    vehicleType: string;
    vehicleCapacity: number;
  }) {
    return request<AuthResponse>('/auth/register/driver', undefined, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  login(payload: { email: string; password: string }) {
    return request<AuthResponse>('/auth/login', undefined, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  me(token: string) {
    return request<User>('/users/me', token);
  },
  updateMe(token: string, payload: { name: string; phone: string; campusAddress?: string }) {
    return request<User>('/users/me', token, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },
  availableDrivers(token: string) {
    return request<DriverSummary[]>('/drivers/available', token);
  },
  campusLocations(token: string) {
    return request<CampusLocation[]>('/locations', token);
  },
  goOnline(token: string) {
    return request<DriverSummary>('/drivers/availability/online', token, { method: 'POST' });
  },
  goOffline(token: string) {
    return request<DriverSummary>('/drivers/availability/offline', token, { method: 'POST' });
  },
  incomingRequests(token: string) {
    return request<Ride[]>('/drivers/requests', token);
  },
  updateDriverLocation(token: string, payload: { latitude: number; longitude: number; accuracy?: number | null }) {
    return request<DriverLocation>('/drivers/location', token, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  driverDashboard(token: string) {
    return request<DriverDashboard>('/drivers/dashboard', token);
  },
  createRide(token: string, payload: {
    pickupLocation: string;
    destination: string;
    pickupLocationId?: number;
    destinationLocationId?: number;
  }) {
    return request<Ride>('/rides', token, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  myRides(token: string) {
    return request<Ride[]>('/rides/my', token);
  },
  acceptRide(token: string, rideId: number) {
    return request<Ride>(`/rides/${rideId}/accept`, token, { method: 'POST' });
  },
  rejectRide(token: string, rideId: number) {
    return request<Ride>(`/rides/${rideId}/reject`, token, { method: 'POST' });
  },
  startRide(token: string, rideId: number) {
    return request<Ride>(`/rides/${rideId}/start`, token, { method: 'POST' });
  },
  completeRide(token: string, rideId: number) {
    return request<Ride>(`/rides/${rideId}/complete`, token, { method: 'POST' });
  },
  cancelRide(token: string, rideId: number) {
    return request<Ride>(`/rides/${rideId}/cancel`, token, { method: 'POST' });
  },
  rateRide(token: string, payload: { rideId: number; rating: number; feedback?: string }) {
    return request<Rating>('/ratings', token, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }
};
