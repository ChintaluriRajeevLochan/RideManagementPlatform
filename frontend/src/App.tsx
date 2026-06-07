import { Client } from '@stomp/stompjs';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Activity,
  Bell,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Clock3,
  LogOut,
  MapPin,
  Navigation,
  LocateFixed,
  ShieldCheck,
  Star,
  UserRound,
  XCircle
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, sessionStore } from './api';
import type {
  AuthResponse,
  AvailabilityStatus,
  CampusLocation,
  DriverDashboard as DriverDashboardData,
  DriverSummary,
  RealtimeEvent,
  Ride,
  RideStatus,
  User
} from './types';

const campusCenter: [number, number] = [29.8667, 77.8966];

const activeStatuses: RideStatus[] = ['REQUESTED', 'ACCEPTED', 'IN_PROGRESS'];

const statusMeta: Record<RideStatus, { label: string; tone: string }> = {
  REQUESTED: { label: 'Requested', tone: 'warning' },
  ACCEPTED: { label: 'Accepted', tone: 'info' },
  IN_PROGRESS: { label: 'In progress', tone: 'active' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' }
};

const availabilityMeta: Record<AvailabilityStatus, { label: string; tone: string }> = {
  ONLINE: { label: 'Online', tone: 'success' },
  OFFLINE: { label: 'Offline', tone: 'muted' },
  BUSY: { label: 'Busy', tone: 'active' }
};

const mapIcons = {
  pickup: mapIcon('P', 'pickup'),
  destination: mapIcon('D', 'destination'),
  driver: mapIcon('R', 'driver')
};

export default function App() {
  const [session, setSession] = useState<AuthResponse | null>(() => sessionStore.read());
  const [notice, setNotice] = useState('Ready for campus rides');
  const [realtimeTick, setRealtimeTick] = useState(0);
  const authVersionRef = useRef(0);

  const saveSession = useCallback((nextSession: AuthResponse) => {
    authVersionRef.current += 1;
    sessionStore.write(nextSession);
    setSession(nextSession);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!session) return;
    const refreshVersion = authVersionRef.current;
    const user = await api.me(session.token);
    const storedSession = sessionStore.read();
    if (authVersionRef.current !== refreshVersion || storedSession?.token !== session.token) {
      return;
    }
    const nextSession = { ...session, user };
    sessionStore.write(nextSession);
    setSession(nextSession);
  }, [session]);

  const signOut = useCallback(() => {
    authVersionRef.current += 1;
    sessionStore.clear();
    setSession(null);
  }, []);

  useEffect(() => {
    if (!session) return;

    const client = new Client({
      brokerURL: import.meta.env.VITE_WS_URL ?? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`,
      reconnectDelay: 2500,
      debug: () => undefined,
      onConnect: () => {
        const handleMessage = (raw: { body: string }) => {
          try {
            const event = JSON.parse(raw.body) as RealtimeEvent;
            setNotice(event.message);
          } catch {
            setNotice('Live update received');
          }
          setRealtimeTick((value) => value + 1);
        };

        client.subscribe(`/topic/users/${session.user.id}/notifications`, handleMessage);
        client.subscribe('/topic/drivers/availability', handleMessage);
        if (session.user.role === 'DRIVER') {
          client.subscribe('/topic/rides/requests', handleMessage);
          client.subscribe(`/topic/drivers/${session.user.id}/dashboard`, handleMessage);
        }
      }
    });

    client.activate();
    return () => {
      void client.deactivate();
    };
  }, [session?.token, session?.user.id, session?.user.role]);

  if (!session) {
    return <AuthScreen onAuthenticated={saveSession} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">
            <Navigation size={24} />
          </div>
          <div>
            <strong>Campus Ride</strong>
            <span>IIT Roorkee e-rickshaw dispatch</span>
          </div>
        </div>

        <div className="sidebar-card">
          <span className="eyebrow">Signed in</span>
          <strong>{session.user.name}</strong>
          <span>{session.user.email}</span>
        </div>

        <div className="live-pill">
          <Bell size={16} />
          <span>{notice}</span>
        </div>

        <button
          className="ghost-button sidebar-action"
          type="button"
          onClick={signOut}
        >
          <LogOut size={18} />
          Sign out
        </button>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <span className="eyebrow">{session.user.role === 'DRIVER' ? 'Driver workspace' : 'Passenger workspace'}</span>
            <h1>{session.user.role === 'DRIVER' ? 'Driver Dashboard' : 'Passenger Dashboard'}</h1>
          </div>
          <RoleBadge user={session.user} />
        </header>

        {session.user.role === 'PASSENGER' ? (
          <PassengerDashboard
            token={session.token}
            user={session.user}
            realtimeTick={realtimeTick}
            onUserRefresh={refreshUser}
            onNotice={setNotice}
          />
        ) : (
          <DriverDashboard
            token={session.token}
            user={session.user}
            realtimeTick={realtimeTick}
            onUserRefresh={refreshUser}
            onNotice={setNotice}
          />
        )}
      </main>
    </div>
  );
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (session: AuthResponse) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [role, setRole] = useState<'PASSENGER' | 'DRIVER'>('PASSENGER');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      let response: AuthResponse;
      if (mode === 'login') {
        response = await api.login({
          email: String(form.get('email') ?? ''),
          password: String(form.get('password') ?? '')
        });
      } else if (role === 'PASSENGER') {
        response = await api.registerPassenger({
          name: String(form.get('name') ?? ''),
          email: String(form.get('email') ?? ''),
          password: String(form.get('password') ?? ''),
          phone: String(form.get('phone') ?? ''),
          campusAddress: String(form.get('campusAddress') ?? '')
        });
      } else {
        response = await api.registerDriver({
          name: String(form.get('name') ?? ''),
          email: String(form.get('email') ?? ''),
          password: String(form.get('password') ?? ''),
          phone: String(form.get('phone') ?? ''),
          licenseNumber: String(form.get('licenseNumber') ?? ''),
          verificationDocument: String(form.get('verificationDocument') ?? ''),
          vehicleNumber: String(form.get('vehicleNumber') ?? ''),
          vehicleType: String(form.get('vehicleType') ?? 'E-Rickshaw'),
          vehicleCapacity: Number(form.get('vehicleCapacity') ?? 4)
        });
      }
      onAuthenticated(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-hero">
        <div className="brand-block">
          <div className="brand-mark">
            <Navigation size={26} />
          </div>
          <div>
            <strong>Campus Ride</strong>
            <span>Centralized e-rickshaw coordination</span>
          </div>
        </div>
        <h1>Real-time ride management for campus mobility</h1>
        <p>
          Passenger requests, driver availability, ride states, dashboards, and feedback stay synchronized from one focused web app.
        </p>
        <div className="auth-highlights">
          <span><CircleDot size={16} /> Live requests</span>
          <span><ShieldCheck size={16} /> Verified drivers</span>
          <span><Activity size={16} /> Driver insights</span>
        </div>
      </section>

      <section className="auth-card">
        <div className="segmented-control">
          <button className={mode === 'login' ? 'active' : ''} type="button" onClick={() => setMode('login')}>
            Login
          </button>
          <button className={mode === 'register' ? 'active' : ''} type="button" onClick={() => setMode('register')}>
            Register
          </button>
        </div>

        {mode === 'register' && (
          <div className="role-switch">
            <button className={role === 'PASSENGER' ? 'selected' : ''} type="button" onClick={() => setRole('PASSENGER')}>
              Passenger
            </button>
            <button className={role === 'DRIVER' ? 'selected' : ''} type="button" onClick={() => setRole('DRIVER')}>
              Driver
            </button>
          </div>
        )}

        <form className="form-grid" onSubmit={submit}>
          {mode === 'register' && (
            <>
              <label>
                Name
                <input name="name" placeholder="Aarav Singh" required />
              </label>
              <label>
                Phone
                <input name="phone" placeholder="+91 98765 43210" required />
              </label>
            </>
          )}

          <label>
            Email
            <input name="email" type="email" placeholder="you@iitr.ac.in" required />
          </label>
          <label>
            Password
            <input name="password" type="password" minLength={6} placeholder="Minimum 6 characters" required />
          </label>

          {mode === 'register' && role === 'PASSENGER' && (
            <label className="span-two">
              Campus address
              <input name="campusAddress" placeholder="Hostel, department, or staff quarter" />
            </label>
          )}

          {mode === 'register' && role === 'DRIVER' && (
            <>
              <label>
                License number
                <input name="licenseNumber" placeholder="DL-UK-2026-1234" required />
              </label>
              <label>
                Verification info
                <input name="verificationDocument" placeholder="Aadhaar / campus permit reference" required />
              </label>
              <label>
                Vehicle number
                <input name="vehicleNumber" placeholder="UK 08 ER 1204" required />
              </label>
              <label>
                Vehicle type
                <input name="vehicleType" defaultValue="E-Rickshaw" required />
              </label>
              <label>
                Capacity
                <input name="vehicleCapacity" type="number" min={1} defaultValue={4} required />
              </label>
            </>
          )}

          {error && <p className="form-error span-two">{error}</p>}

          <button className="primary-button span-two" type="submit" disabled={loading}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Login' : `Create ${role.toLowerCase()} account`}
          </button>
        </form>
      </section>
    </main>
  );
}

function PassengerDashboard({
  token,
  user,
  realtimeTick,
  onUserRefresh,
  onNotice
}: {
  token: string;
  user: User;
  realtimeTick: number;
  onUserRefresh: () => Promise<void>;
  onNotice: (notice: string) => void;
}) {
  const [drivers, setDrivers] = useState<DriverSummary[]>([]);
  const [rides, setRides] = useState<Ride[]>([]);
  const [locations, setLocations] = useState<CampusLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pickupLocationId, setPickupLocationId] = useState<number | null>(null);
  const [destinationLocationId, setDestinationLocationId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [availableDrivers, myRides, campusLocations] = await Promise.all([
        api.availableDrivers(token),
        api.myRides(token),
        api.campusLocations(token)
      ]);
      setDrivers(availableDrivers);
      setRides(myRides);
      setLocations(campusLocations);
      setPickupLocationId((current) => validLocationId(current, campusLocations) ?? campusLocations[0]?.id ?? null);
      setDestinationLocationId((current) => validLocationId(current, campusLocations) ?? campusLocations[1]?.id ?? campusLocations[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load passenger dashboard');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load, realtimeTick]);

  const activeRide = useMemo(() => rides.find((ride) => activeStatuses.includes(ride.status)) ?? null, [rides]);
  const selectedPickup = useMemo(() => locations.find((location) => location.id === pickupLocationId) ?? null, [locations, pickupLocationId]);
  const selectedDestination = useMemo(() => locations.find((location) => location.id === destinationLocationId) ?? null, [locations, destinationLocationId]);
  const completedRides = rides.filter((ride) => ride.status === 'COMPLETED');

  async function requestRide(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (!selectedPickup || !selectedDestination) {
      setError('Select pickup and destination');
      return;
    }
    if (selectedPickup.id === selectedDestination.id) {
      setError('Pickup and destination must be different');
      return;
    }
    try {
      await api.createRide(token, {
        pickupLocation: selectedPickup.name,
        destination: selectedDestination.name,
        pickupLocationId: selectedPickup.id,
        destinationLocationId: selectedDestination.id
      });
      onNotice('Ride requested');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not request ride');
    }
  }

  async function cancelRide(rideId: number) {
    setError('');
    try {
      await api.cancelRide(token, rideId);
      onNotice('Ride cancelled');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel ride');
    }
  }

  async function submitRating(rideId: number, score: number, feedback: string) {
    setError('');
    try {
      await api.rateRide(token, { rideId, rating: score, feedback });
      onNotice('Feedback submitted');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit rating');
    }
  }

  return (
    <div className="dashboard-grid">
      <section className="panel span-two">
        <PanelHeader icon={<MapPin size={20} />} title="Request a ride" subtitle="Choose pickup and destination inside campus" />
        <form className="request-form" onSubmit={requestRide}>
          <LocationSelect label="Pickup" locations={locations} value={pickupLocationId} onChange={setPickupLocationId} />
          <LocationSelect label="Destination" locations={locations} value={destinationLocationId} onChange={setDestinationLocationId} />
          <button className="primary-button" type="submit" disabled={Boolean(activeRide) || !selectedPickup || !selectedDestination}>
            Request ride
          </button>
        </form>
        {activeRide && <p className="soft-note">Finish or cancel your active ride before requesting another one.</p>}
      </section>

      <section className="panel span-two">
        <PanelHeader icon={<LocateFixed size={20} />} title="Campus map" subtitle="Pickup, destination, and assigned driver location" />
        <RideMap ride={activeRide} pickup={selectedPickup} destination={selectedDestination} />
      </section>

      <section className="panel">
        <PanelHeader icon={<UserRound size={20} />} title="Available drivers" subtitle="Live online driver pool" />
        <div className="driver-list">
          {drivers.length === 0 ? (
            <EmptyState text="No drivers online right now" />
          ) : (
            drivers.map((driver) => <DriverRow key={driver.id} driver={driver} />)
          )}
        </div>
      </section>

      <ProfilePanel token={token} user={user} onUserRefresh={onUserRefresh} onNotice={onNotice} />

      <section className="panel span-two">
        <PanelHeader icon={<Clock3 size={20} />} title="Current ride" subtitle="Live ride lifecycle status" />
        {activeRide ? (
          <RideCard ride={activeRide} actions={<button className="danger-button" type="button" onClick={() => cancelRide(activeRide.id)}>Cancel ride</button>} />
        ) : (
          <EmptyState text="No active ride. Request one when you are ready." />
        )}
      </section>

      <section className="panel span-two">
        <PanelHeader icon={<Star size={20} />} title="Ride history and feedback" subtitle="Rate completed rides once" />
        {loading ? <EmptyState text="Loading rides..." /> : null}
        {error && <p className="form-error">{error}</p>}
        <div className="history-list">
          {rides.length === 0 && !loading ? <EmptyState text="No rides yet" /> : null}
          {rides.map((ride) => (
            <div className="history-item" key={ride.id}>
              <RideCard ride={ride} />
              {ride.status === 'COMPLETED' && !ride.rating && (
                <RatingForm rideId={ride.id} onSubmit={submitRating} />
              )}
            </div>
          ))}
        </div>
        <div className="mini-stats">
          <StatCard label="Total rides" value={rides.length} icon={<Activity size={18} />} />
          <StatCard label="Completed" value={completedRides.length} icon={<CheckCircle2 size={18} />} />
          <StatCard label="Rated rides" value={completedRides.filter((ride) => ride.rating).length} icon={<Star size={18} />} />
        </div>
      </section>
    </div>
  );
}

function DriverDashboard({
  token,
  user,
  realtimeTick,
  onUserRefresh,
  onNotice
}: {
  token: string;
  user: User;
  realtimeTick: number;
  onUserRefresh: () => Promise<void>;
  onNotice: (notice: string) => void;
}) {
  const [dashboard, setDashboard] = useState<DriverDashboardData | null>(null);
  const [incoming, setIncoming] = useState<Ride[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [gpsStatus, setGpsStatus] = useState('GPS idle');
  const lastSentLocationRef = useRef<{ latitude: number; longitude: number; sentAt: number } | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [dashboardData, requests] = await Promise.all([api.driverDashboard(token), api.incomingRequests(token)]);
      setDashboard(dashboardData);
      setIncoming(requests);
      await onUserRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load driver dashboard');
    }
  }, [token, onUserRefresh]);

  useEffect(() => {
    void load();
  }, [load, realtimeTick]);

  async function runAction(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError('');
    try {
      await action();
      onNotice(success);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  const availability = user.driver?.availabilityStatus ?? 'OFFLINE';

  useEffect(() => {
    if (availability === 'OFFLINE') {
      setGpsStatus('GPS paused');
      lastSentLocationRef.current = null;
      return;
    }
    if (!navigator.geolocation) {
      setGpsStatus('GPS unavailable');
      return;
    }

    let cancelled = false;
    setGpsStatus('Waiting for GPS');

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const nextLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        };
        const last = lastSentLocationRef.current;
        if (last && Date.now() - last.sentAt < 10_000 && distanceMeters(last, nextLocation) < 12) {
          return;
        }

        lastSentLocationRef.current = {
          latitude: nextLocation.latitude,
          longitude: nextLocation.longitude,
          sentAt: Date.now()
        };

        void api.updateDriverLocation(token, nextLocation)
          .then(() => {
            if (!cancelled) {
              setGpsStatus('GPS live');
            }
          })
          .catch((err) => {
            if (!cancelled) {
              setGpsStatus(err instanceof Error ? err.message : 'GPS sync failed');
            }
          });
      },
      (geoError) => {
        setGpsStatus(geolocationErrorMessage(geoError));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000
      }
    );

    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [availability, token]);

  const chartData = dashboard?.rideStatusBreakdown.map((item) => ({
    status: statusMeta[item.status].label,
    count: item.count
  })) ?? [];

  return (
    <div className="dashboard-grid">
      <section className="panel span-two">
        <PanelHeader icon={<ShieldCheck size={20} />} title="Availability" subtitle="Control whether passengers and dispatch can see you" />
        <div className="availability-strip">
          <StatusPill label={availabilityMeta[availability].label} tone={availabilityMeta[availability].tone} />
          <button
            className={availability === 'OFFLINE' ? 'primary-button' : 'secondary-button'}
            type="button"
            disabled={busy || availability === 'BUSY'}
            onClick={() =>
              runAction(
                () => (availability === 'OFFLINE' ? api.goOnline(token) : api.goOffline(token)),
                availability === 'OFFLINE' ? 'You are online' : 'You are offline'
              )
            }
          >
            {availability === 'OFFLINE' ? 'Go online' : availability === 'BUSY' ? 'Ride in progress' : 'Go offline'}
          </button>
          {user.driver?.vehicle && (
            <span className="vehicle-chip">
              {user.driver.vehicle.vehicleNumber} · {user.driver.vehicle.vehicleType} · {user.driver.vehicle.capacity} seats
            </span>
          )}
          <span className={`gps-chip ${availability === 'OFFLINE' ? '' : 'active'}`}>
            <LocateFixed size={16} />
            {gpsStatus}
          </span>
        </div>
      </section>

      <ProfilePanel token={token} user={user} onUserRefresh={onUserRefresh} onNotice={onNotice} />

      <section className="panel">
        <PanelHeader icon={<Bell size={20} />} title="Incoming requests" subtitle="First accepted driver gets the ride" />
        {error && <p className="form-error">{error}</p>}
        <div className="request-list">
          {incoming.length === 0 ? (
            <EmptyState text="No pending ride requests" />
          ) : (
            incoming.map((ride) => (
              <RideCard
                key={ride.id}
                ride={ride}
                compact
                showMap
                actions={
                  <div className="action-row">
                    <button className="primary-button" type="button" disabled={busy || availability !== 'ONLINE'} onClick={() => runAction(() => api.acceptRide(token, ride.id), 'Ride accepted')}>
                      Accept
                    </button>
                    <button className="ghost-button" type="button" disabled={busy} onClick={() => runAction(() => api.rejectRide(token, ride.id), 'Ride rejected')}>
                      Reject
                    </button>
                  </div>
                }
              />
            ))
          )}
        </div>
      </section>

      <section className="panel span-two">
        <PanelHeader icon={<Navigation size={20} />} title="Active ride" subtitle="Move the ride through its lifecycle" />
        {dashboard?.activeRide ? (
          <RideCard
            ride={dashboard.activeRide}
            showMap
            actions={
              <div className="action-row">
                {dashboard.activeRide.status === 'ACCEPTED' && (
                  <button className="primary-button" type="button" disabled={busy} onClick={() => runAction(() => api.startRide(token, dashboard.activeRide!.id), 'Ride started')}>
                    Start ride
                  </button>
                )}
                {dashboard.activeRide.status === 'IN_PROGRESS' && (
                  <button className="primary-button" type="button" disabled={busy} onClick={() => runAction(() => api.completeRide(token, dashboard.activeRide!.id), 'Ride completed')}>
                    Complete
                  </button>
                )}
                <button className="danger-button" type="button" disabled={busy} onClick={() => runAction(() => api.cancelRide(token, dashboard.activeRide!.id), 'Ride cancelled')}>
                  Cancel
                </button>
              </div>
            }
          />
        ) : (
          <EmptyState text="No active ride assigned" />
        )}
      </section>

      <section className="panel span-two">
        <PanelHeader icon={<Activity size={20} />} title="Performance" subtitle="Completed rides, active rides, ratings, and history" />
        <div className="mini-stats">
          <StatCard label="Completed rides" value={dashboard?.totalRidesCompleted ?? 0} icon={<CheckCircle2 size={18} />} />
          <StatCard label="Active rides" value={dashboard?.activeRides ?? 0} icon={<CircleDot size={18} />} />
          <StatCard label="Average rating" value={(dashboard?.averageRating ?? 0).toFixed(2)} icon={<Star size={18} />} />
          <StatCard label="Ratings" value={dashboard?.ratingCount ?? 0} icon={<Bell size={18} />} />
        </div>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="status" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#0f766e" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel span-two">
        <PanelHeader icon={<CalendarClock size={20} />} title="Ride history" subtitle="Recent assigned rides and passenger feedback" />
        <div className="history-list">
          {dashboard?.rideHistory.length === 0 ? <EmptyState text="No ride history yet" /> : null}
          {dashboard?.rideHistory.map((ride) => <RideCard key={ride.id} ride={ride} />)}
        </div>
      </section>
    </div>
  );
}

function ProfilePanel({
  token,
  user,
  onUserRefresh,
  onNotice
}: {
  token: string;
  user: User;
  onUserRefresh: () => Promise<void>;
  onNotice: (notice: string) => void;
}) {
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone);
  const [campusAddress, setCampusAddress] = useState(user.passenger?.campusAddress ?? '');
  const [error, setError] = useState('');

  useEffect(() => {
    setName(user.name);
    setPhone(user.phone);
    setCampusAddress(user.passenger?.campusAddress ?? '');
  }, [user]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api.updateMe(token, { name, phone, campusAddress });
      onNotice('Profile updated');
      await onUserRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update profile');
    }
  }

  return (
    <section className="panel">
      <PanelHeader icon={<UserRound size={20} />} title="Profile" subtitle="Account details" />
      <form className="profile-form" onSubmit={save}>
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label>
          Phone
          <input value={phone} onChange={(event) => setPhone(event.target.value)} required />
        </label>
        {user.role === 'PASSENGER' && (
          <label>
            Campus address
            <input value={campusAddress} onChange={(event) => setCampusAddress(event.target.value)} />
          </label>
        )}
        {user.role === 'DRIVER' && user.driver && (
          <div className="driver-verification">
            <StatusPill label={user.driver.verificationStatus} tone="success" />
            <span>License: {user.driver.licenseNumber}</span>
          </div>
        )}
        {error && <p className="form-error">{error}</p>}
        <button className="secondary-button" type="submit">
          Save profile
        </button>
      </form>
    </section>
  );
}

function LocationSelect({
  label,
  locations,
  value,
  onChange
}: {
  label: string;
  locations: CampusLocation[];
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <label>
      {label}
      <select value={value ?? ''} onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)} required>
        <option value="" disabled>Select location</option>
        {locations.map((location) => (
          <option key={location.id} value={location.id}>
            {location.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function DriverRow({ driver }: { driver: DriverSummary }) {
  return (
    <div className="driver-row">
      <div className="avatar">{driver.name.slice(0, 1).toUpperCase()}</div>
      <div>
        <strong>{driver.name}</strong>
        <span>{driver.vehicle?.vehicleNumber ?? 'Vehicle pending'} · {driver.phone}</span>
      </div>
      <StatusPill label={`${Number(driver.averageRating).toFixed(1)} ★`} tone="success" />
    </div>
  );
}

function RideCard({
  ride,
  actions,
  compact = false,
  showMap = false
}: {
  ride: Ride;
  actions?: React.ReactNode;
  compact?: boolean;
  showMap?: boolean;
}) {
  const rideNotice = ride.driver
    ? { tone: 'accepted', icon: <CheckCircle2 size={16} />, text: `Ride accepted by ${ride.driver.name}` }
    : ride.status === 'REQUESTED' && ride.latestRejectedBy
      ? { tone: 'rejected', icon: <XCircle size={16} />, text: `Ride rejected by ${ride.latestRejectedBy.name}` }
      : null;

  return (
    <article className={`ride-card ${compact ? 'compact' : ''}`}>
      <div className="ride-card-top">
        <div>
          <span className="eyebrow">Ride #{ride.id}</span>
          <strong>{ride.pickupLocation} → {ride.destination}</strong>
        </div>
        <StatusPill label={statusMeta[ride.status].label} tone={statusMeta[ride.status].tone} />
      </div>
      {rideNotice && (
        <div className={`ride-event-note ${rideNotice.tone}`}>
          {rideNotice.icon}
          <span>{rideNotice.text}</span>
        </div>
      )}
      <div className="ride-meta-grid">
        <span><MapPin size={15} /> Pickup: {ride.pickupLocation}</span>
        <span><Navigation size={15} /> Destination: {ride.destination}</span>
        <span><Clock3 size={15} /> Requested: {formatTime(ride.requestedAt)}</span>
        <span><UserRound size={15} /> Passenger: {ride.passenger.name}</span>
        {ride.driver && <span><ShieldCheck size={15} /> Driver: {ride.driver.name}</span>}
        {ride.latestRejectedBy && !ride.driver && <span><XCircle size={15} /> Latest rejection: {formatTime(ride.latestRejectedAt)}</span>}
        {ride.rating && <span><Star size={15} /> Rating: {ride.rating.score}/5</span>}
      </div>
      {showMap && <RideMap ride={ride} />}
      {actions && <div className="ride-actions">{actions}</div>}
    </article>
  );
}

type RideMapProps = {
  ride?: Ride | null;
  pickup?: CampusLocation | null;
  destination?: CampusLocation | null;
};

type MapPoint = {
  key: string;
  label: string;
  detail: string;
  latitude: number;
  longitude: number;
  icon: L.DivIcon;
};

function RideMap({ ride, pickup, destination }: RideMapProps) {
  const points = useMemo(() => {
    const pickupPoint = ride?.pickupLatitude != null && ride?.pickupLongitude != null
      ? {
        key: 'pickup',
        label: 'Pickup',
        detail: ride.pickupLocation,
        latitude: ride.pickupLatitude,
        longitude: ride.pickupLongitude,
        icon: mapIcons.pickup
      }
      : pickup
        ? {
          key: 'pickup',
          label: 'Pickup',
          detail: pickup.name,
          latitude: pickup.latitude,
          longitude: pickup.longitude,
          icon: mapIcons.pickup
        }
        : null;

    const destinationPoint = ride?.destinationLatitude != null && ride?.destinationLongitude != null
      ? {
        key: 'destination',
        label: 'Destination',
        detail: ride.destination,
        latitude: ride.destinationLatitude,
        longitude: ride.destinationLongitude,
        icon: mapIcons.destination
      }
      : destination
        ? {
          key: 'destination',
          label: 'Destination',
          detail: destination.name,
          latitude: destination.latitude,
          longitude: destination.longitude,
          icon: mapIcons.destination
        }
        : null;

    const driverPoint = ride?.driverLocation
      ? {
        key: 'driver',
        label: 'Driver',
        detail: ride.driverLocation.driverName,
        latitude: ride.driverLocation.latitude,
        longitude: ride.driverLocation.longitude,
        icon: mapIcons.driver
      }
      : null;

    return [pickupPoint, destinationPoint, driverPoint].filter(Boolean) as MapPoint[];
  }, [destination, pickup, ride]);

  if (points.length === 0) {
    return <EmptyState text="Map coordinates unavailable" />;
  }

  const center: [number, number] = [points[0].latitude, points[0].longitude];

  return (
    <div className="map-shell">
      <MapContainer center={center} zoom={16} scrollWheelZoom={false} className="ride-map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitMapToPoints points={points} />
        {points.map((point) => (
          <Marker
            key={`${point.key}-${point.latitude}-${point.longitude}`}
            position={[point.latitude, point.longitude]}
            icon={point.icon}
          >
            <Popup>
              <strong>{point.label}</strong>
              <br />
              {point.detail}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

function FitMapToPoints({ points }: { points: MapPoint[] }) {
  const map = useMap();
  const pointKey = points.map((point) => `${point.key}:${point.latitude.toFixed(5)}:${point.longitude.toFixed(5)}`).join('|');

  useEffect(() => {
    if (points.length === 1) {
      map.setView([points[0].latitude, points[0].longitude], 16);
      return;
    }
    const bounds = L.latLngBounds(points.map((point) => [point.latitude, point.longitude]));
    map.fitBounds(bounds, { padding: [38, 38], maxZoom: 17 });
  }, [map, pointKey, points]);

  return null;
}

function RatingForm({
  rideId,
  onSubmit
}: {
  rideId: number;
  onSubmit: (rideId: number, score: number, feedback: string) => Promise<void>;
}) {
  const [score, setScore] = useState(5);
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      await onSubmit(rideId, score, feedback);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="rating-form" onSubmit={submit}>
      <label>
        Rating
        <select value={score} onChange={(event) => setScore(Number(event.target.value))}>
          {[5, 4, 3, 2, 1].map((value) => (
            <option key={value} value={value}>{value} stars</option>
          ))}
        </select>
      </label>
      <label>
        Feedback
        <input value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Optional feedback" />
      </label>
      <button className="secondary-button" type="submit" disabled={loading}>
        Submit feedback
      </button>
    </form>
  );
}

function RoleBadge({ user }: { user: User }) {
  if (user.role === 'DRIVER') {
    const availability = user.driver?.availabilityStatus ?? 'OFFLINE';
    return (
      <div className="role-badge">
        <ShieldCheck size={18} />
        <span>Driver</span>
        <StatusPill label={availabilityMeta[availability].label} tone={availabilityMeta[availability].tone} />
      </div>
    );
  }
  return (
    <div className="role-badge">
      <UserRound size={18} />
      <span>Passenger</span>
    </div>
  );
}

function PanelHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="panel-header">
      <div className="panel-icon">{icon}</div>
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="stat-card">
      <span>{icon}</span>
      <strong>{value}</strong>
      <small>{label}</small>
    </div>
  );
}

function StatusPill({ label, tone }: { label: string; tone: string }) {
  return <span className={`status-pill ${tone}`}>{label}</span>;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <XCircle size={18} />
      <span>{text}</span>
    </div>
  );
}

function validLocationId(current: number | null, locations: CampusLocation[]) {
  if (current == null) {
    return null;
  }
  return locations.some((location) => location.id === current) ? current : null;
}

function mapIcon(label: string, tone: 'pickup' | 'destination' | 'driver') {
  return L.divIcon({
    className: `map-pin map-pin-${tone}`,
    html: `<span>${label}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18]
  });
}

function distanceMeters(
  start: { latitude: number; longitude: number },
  end: { latitude: number; longitude: number }
) {
  const earthRadiusMeters = 6371000;
  const startLat = toRadians(start.latitude);
  const endLat = toRadians(end.latitude);
  const latDelta = toRadians(end.latitude - start.latitude);
  const lonDelta = toRadians(end.longitude - start.longitude);
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(startLat) * Math.cos(endLat) * Math.sin(lonDelta / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value: number) {
  return value * Math.PI / 180;
}

function geolocationErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) return 'GPS permission denied';
  if (error.code === error.POSITION_UNAVAILABLE) return 'GPS unavailable';
  if (error.code === error.TIMEOUT) return 'GPS timeout';
  return 'GPS error';
}

function formatTime(value?: string | null) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short'
  }).format(new Date(value));
}
