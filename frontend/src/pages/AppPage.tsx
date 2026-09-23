import React, { useState } from 'react';
import { apiClient } from '../utils/apiClient';
import Header from '../components/Header';
import PatientForm from '../components/PatientForm';
import NoteEditor from '../components/NoteEditor';
import PatientHistory from '../components/PatientHistory';
import VitalsCard from '../components/VitalsCard';
import AppointmentsCard from '../components/AppointmentsCard';
import VisitsCard from '../components/VisitsCard';
import TemplatesAnalyticsPanel from '../components/TemplatesAnalyticsPanel';
import ScheduledVisitsPanel from '../components/ScheduledVisitsPanel';
import DoctorDashboard from '../components/DoctorDashboard';
import DoctorProfile from '../components/DoctorProfile';
import { PatientsListPage } from './PatientsListPage';
import { useAuth } from '../hooks/useAuth';
import { confirmDiscardChanges } from '../hooks/useUnsavedChanges';

interface Patient {
  id: number;
  patient_id: string;
  first_name: string;
  last_name: string;
  gender?: string;
  dob: string;
  phone: string;
  email: string;
  allergies: string;
  medical_conditions: string;
  medications: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ScanParsedData {
  rawName: string | null;
  firstName: string | null;
  lastName: string | null;
  gender: string | null;
  dob: string | null;
  age: string | null;
  mrn: string | null;
  account: string | null;
  dateOfService: string | null;
  location: string | null;
  patientId: string | null;
  confidenceWarnings: string[];
}

type ScanDecisionState = 'idle' | 'matched' | 'new' | 'failed';

interface PatientScope {
  generation: number;
  id: number | null;
  identifier: string | null;
}

interface ScanBinding {
  generation: number;
  id: number | null;
  identifier: string;
  parsed: ScanParsedData;
}

export function AppPage() {
  const [patientId, setPatientId] = useState('');
  const [searchError, setSearchError] = useState('');
  const [patient, setPatient] = useState<Patient | null>(null);
  const [patientExists, setPatientExists] = useState(false);
  const [step, setStep] = useState<'search' | 'create' | 'edit' | 'patients' | 'dashboard' | 'profile'>('search');
  const [loading, setLoading] = useState(false);
  const { logout, user } = useAuth();
  const [isMobile, setIsMobile] = React.useState(typeof window !== 'undefined' && window.innerWidth <= 768);
  const noteDirty = React.useRef(false);
  const navigationGeneration = React.useRef(0);
  const [navigationVersion, setNavigationVersion] = useState(0);
  const currentPatient = React.useRef<Patient | null>(null);
  const mounted = React.useRef(false);
  const handleNoteDirtyChange = React.useCallback((dirty: boolean) => { noteDirty.current = dirty; }, []);

  // A form retains the callback from its submitting render across await. Capture
  // that render's scope, not the generation at the time its response arrives.
  const renderedScope: PatientScope = {
    generation: navigationVersion,
    id: patient?.id ?? null,
    identifier: patient?.patient_id ?? null,
  };
  const captureScope = (): PatientScope => ({
    generation: navigationGeneration.current,
    id: currentPatient.current?.id ?? null,
    identifier: currentPatient.current?.patient_id ?? null,
  });
  const isCurrentScope = (scope: PatientScope) => mounted.current
    && scope.generation === navigationGeneration.current
    && scope.id === (currentPatient.current?.id ?? null)
    && scope.identifier === (currentPatient.current?.patient_id ?? null);
  const replacePatient = (next: Patient | null) => {
    // Update the identity synchronously, before React processes queued renders.
    currentPatient.current = next;
    setPatient(next);
  };

  // Confirmation alone never invalidates rightful in-flight requests.
  const confirmNavigation = () => confirmDiscardChanges(noteDirty.current);
  const beginNavigation = () => {
    setNavigationVersion(++navigationGeneration.current);
    stopCamera();
    clearScan();
    setLoading(false);
    setScanLoading(false);
    setSearchError('');
  };
  const navigate = (destination: 'search' | 'dashboard' | 'patients' | 'profile') => {
    if (step === destination || !confirmNavigation()) return;
    beginNavigation();
    setStep(destination);
  };
  const handleLogout = () => {
    if (!confirmNavigation()) return;
    beginNavigation();
    logout();
  };
  
  // Camera states
  const [showCamera, setShowCamera] = useState(false);
  const cameraStream = React.useRef<MediaStream | null>(null);
  const cameraAttachTimer = React.useRef<number | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [scanBinding, setScanBinding] = useState<ScanBinding | null>(null);
  // Covers permission/encoding/OCR and the resulting review, even before an ID is known.
  const scanAttemptActive = React.useRef(false);
  const boundScan = scanBinding
    && scanBinding.generation === navigationVersion
    && scanBinding.identifier === patientId
    && scanBinding.id === (patient?.id ?? null)
    && (!patient || scanBinding.identifier === patient.patient_id) ? scanBinding : null;
  const scanResult = boundScan?.parsed ?? null;
  const scanInitialData = React.useMemo(() => scanResult ? {
    firstName: scanResult.firstName || '',
    lastName: scanResult.lastName || '',
    gender: scanResult.gender || '',
    dob: scanResult.dob || '',
  } : undefined, [scanResult]);
  const [scanRawText, setScanRawText] = useState('');
  const [scanLoading, setScanLoading] = useState(false);
  const [scanDecision, setScanDecision] = useState<ScanDecisionState>('idle');
  const [showManualCreate, setShowManualCreate] = useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  const releaseCameraResources = React.useCallback(() => {
    if (cameraAttachTimer.current !== null) window.clearTimeout(cameraAttachTimer.current);
    cameraAttachTimer.current = null;
    cameraStream.current?.getTracks().forEach(track => track.stop());
    cameraStream.current = null;
    if (videoRef.current) {
      videoRef.current.onloadedmetadata = null;
      videoRef.current.srcObject = null;
    }
  }, []);

  React.useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      releaseCameraResources();
    };
  }, [releaseCameraResources]);

  const clearScan = () => {
    scanAttemptActive.current = false;
    setCapturedImage(null);
    setScanBinding(null);
    setScanRawText('');
    setScanDecision('idle');
    setShowManualCreate(false);
  };

  const handleSearchIdChange = (identifier: string) => {
    if (identifier === patientId || !confirmNavigation()) return;
    // Changing a scan's ID is new manual intent, not approval to reuse its fields.
    // Ordinary in-flight manual searches retain their existing resolved-ID behavior.
    if (scanAttemptActive.current || scanBinding) {
      beginNavigation();
      replacePatient(null);
      setPatientExists(false);
    }
    setPatientId(identifier);
  };

  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmNavigation()) return;
    beginNavigation();
    const current = captureScope();
    setSearchError('');
    setLoading(true);

    try {
      const response = await apiClient.searchPatient(patientId);
      if (!isCurrentScope(current)) return;
      // Commit a new view only after checking the request's originating scope.
      beginNavigation();
      if (response.data.exists) {
        replacePatient(response.data.patient);
        setPatientId(response.data.patient.patient_id);
        setPatientExists(true);
        setStep('edit');
      } else {
        replacePatient(null);
        setPatientId(patientId);
        setPatientExists(false);
        setStep('create');
      }
    } catch (err: any) {
      if (!isCurrentScope(current)) return;
      setSearchError(err.response?.data?.error || 'Search failed');
    } finally {
      if (isCurrentScope(current)) setLoading(false);
    }
  };

  const handlePatientCreated = (newPatient: Patient) => {
    if (!isCurrentScope(renderedScope)) return;
    if (!confirmNavigation()) return;
    beginNavigation();
    replacePatient(newPatient);
    setPatientId(newPatient.patient_id);
    setPatientExists(true);
    setStep('edit');
  };

  const handlePatientUpdated = (updatedPatient: Patient) => {
    if (!isCurrentScope(renderedScope)) return;
    if (updatedPatient.id !== renderedScope.id || updatedPatient.patient_id !== renderedScope.identifier) {
      if (!confirmNavigation()) return;
      beginNavigation();
    }
    replacePatient(updatedPatient);
    setPatientId(updatedPatient.patient_id);
  };

  const handleReset = () => {
    if (!confirmNavigation()) return;
    beginNavigation();
    setPatientId('');
    replacePatient(null);
    setPatientExists(false);
    setStep('search');
    setSearchError('');
  };

  const handleActivateDeactivate = async (patientId: string | number, is_active: boolean) => {
    const current = renderedScope;
    if (!isCurrentScope(current) || current.id !== patientId) return false;
    try {
      await apiClient.updatePatientStatus(patientId, is_active);
      if (!isCurrentScope(current)) return false;
      replacePatient({ ...currentPatient.current!, is_active });
      return true;
    } catch (err: any) {
      if (!isCurrentScope(current)) return false;
      setSearchError(err.response?.data?.error || 'Failed to update patient status');
      throw err;
    }
  };

  const handleEditFromList = (patientFromList: Patient) => {
    if (!confirmNavigation()) return;
    beginNavigation();
    replacePatient(patientFromList);
    setPatientId(patientFromList.patient_id);
    setPatientExists(true);
    setStep('edit');
  };

  const handleBackFromPatients = () => {
    navigate('search');
  };

  const handleOpenCreateFromScan = () => {
    if (!confirmNavigation()) return;
    // Only this explicit review action may carry an unmatched scan into a new view.
    const reviewedScan = scanDecision === 'new' ? boundScan : null;
    if (scanDecision !== 'failed' && !reviewedScan) return;
    beginNavigation();
    replacePatient(null);
    setPatientExists(false);
    if (reviewedScan) {
      setScanBinding({ ...reviewedScan, generation: navigationGeneration.current, id: null });
    }
    setStep('create');
    setShowManualCreate(!reviewedScan);
  };

  const handleCorrectScanId = () => {
    if (!boundScan || !confirmNavigation()) return;
    // Remount the real form to discard both OCR defaults and any edited A fields.
    beginNavigation();
    setShowManualCreate(true);
  };

  const handleOpenEditFromScan = () => {
    if (!patient || !boundScan || scanDecision !== 'matched') {
      return;
    }

    if (!confirmNavigation()) return;
    beginNavigation();
    setPatientId(patient.patient_id);
    setPatientExists(true);
    setStep('edit');
  };

  // Camera functionality
  const startCamera = async () => {
    if (!confirmNavigation()) return;
    beginNavigation();
    scanAttemptActive.current = true;
    replacePatient(null);
    setPatientExists(false);
    const current = captureScope();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      if (!isCurrentScope(current)) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      cameraStream.current = stream;
      setShowCamera(true);
      
      // Wait for next tick to ensure element is rendered
      cameraAttachTimer.current = window.setTimeout(() => {
        cameraAttachTimer.current = null;
        if (!isCurrentScope(current) || cameraStream.current !== stream || !videoRef.current) return;
        const video = videoRef.current;
        video.srcObject = stream;
        video.onloadedmetadata = () => {
          if (!isCurrentScope(current) || cameraStream.current !== stream) return;
          void video.play()?.catch(() => { /* A closed/blocked camera must not affect the new view. */ });
        };
      }, 100);
    } catch (err) {
      if (!isCurrentScope(current)) return;
      setSearchError('Could not access camera. Please allow camera permissions.');
    }
  };

  const stopCamera = () => {
    releaseCameraResources();
    setShowCamera(false);
  };

  const cancelCamera = () => {
    // Unlike Capture, Cancel abandons this camera/scan generation.
    beginNavigation();
  };

  const processCapturedPhoto = async (canvas: HTMLCanvasElement) => {
    const current = captureScope();
    setScanLoading(true);
    setSearchError('');

    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      if (!isCurrentScope(current)) return;
      if (!blob) {
        throw new Error('Failed to create image from camera capture');
      }

      const response = await apiClient.scanPatientSticker(blob);
      if (!isCurrentScope(current)) return;
      const { parsed, text, exists, patient: existingPatient } = response.data;

      setScanLoading(false);
      // A matched record's resolved identity wins over OCR aliases/corrections.
      const resolvedPatient = exists && existingPatient ? existingPatient : null;
      const identifier = resolvedPatient?.patient_id || parsed?.patientId || parsed?.mrn || parsed?.account || '';
      setScanBinding(parsed ? {
        generation: current.generation, id: resolvedPatient?.id ?? null, identifier, parsed,
      } : null);
      setScanRawText(text || '');
      setPatientId(identifier);

      const hasMeaningfulParsedData = Boolean(
        parsed && (
          parsed.rawName ||
          parsed.firstName ||
          parsed.lastName ||
          parsed.dob ||
          parsed.mrn ||
          parsed.account ||
          parsed.location
        )
      );

      const hasRawOcrText = Boolean((text || '').trim());
      const parseFailed = !hasMeaningfulParsedData && !hasRawOcrText;

      if (exists && existingPatient) {
        replacePatient(existingPatient);
        setPatientExists(true);
        setScanDecision('matched');
        setShowManualCreate(false);
        setSearchError('Patient sticker scanned successfully. Review the parsed data below and choose Edit Patient.');
      } else if (parseFailed) {
        replacePatient(null);
        setPatientExists(false);
        setScanDecision('failed');
        setShowManualCreate(false);
        setSearchError('Failed to process sticker image. You can create the patient manually.');
      } else {
        replacePatient(null);
        setPatientExists(false);
        setScanDecision('new');
        setShowManualCreate(false);
        setSearchError('Sticker scanned. Review the parsed data below and create a new patient if it looks correct.');
      }

      if (navigator.vibrate) {
        navigator.vibrate(100);
      }
    } catch (err: any) {
      if (!isCurrentScope(current)) return;
      setScanDecision('failed');
      setShowManualCreate(false);
      setSearchError(err.response?.data?.error || err.message || 'Failed to scan patient sticker');
    } finally {
      if (isCurrentScope(current)) setScanLoading(false);
    }
  };

  const capturePhoto = () => {
    if (cameraStream.current && videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = frame.data;

        for (let i = 0; i < data.length; i += 4) {
          const grayscale = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
          const thresholded = grayscale > 165 ? 255 : 0;
          data[i] = thresholded;
          data[i + 1] = thresholded;
          data[i + 2] = thresholded;
        }

        ctx.putImageData(frame, 0, 0);

        const imageData = canvas.toDataURL('image/jpeg', 0.92);
        setCapturedImage(imageData);
        stopCamera();
        setSearchError('Photo captured! Processing patient sticker...');
        void processCapturedPhoto(canvas);
      }
    }
  };

  return (
    <div style={styles.container}>
      <Header
        onNavigate={navigate}
        userEmail={user?.email}
        onLogout={handleLogout}
      />

      <main style={{ ...styles.main, padding: isMobile ? '16px' : '24px' }}>
        {step === 'profile' && (
          <DoctorProfile onClose={() => navigate('search')} />
        )}

        {step === 'dashboard' && (
          <div>
            <button onClick={() => navigate('search')} style={styles.backButton}>
              ← Back to Search
            </button>
            <DoctorDashboard />
          </div>
        )}

        {step === 'patients' && (
          <div>
            <PatientsListPage onEditPatient={handleEditFromList} onBack={handleBackFromPatients} />
          </div>
        )}

        {step === 'search' && (
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Search Patient</h2>
            <form onSubmit={handleSearch} style={{ ...styles.form, flexDirection: isMobile ? 'column' : 'row' }}>
              <input
                type="text"
                placeholder="Enter Patient ID (e.g., P001) - will create if not found"
                value={patientId}
                onChange={(e) => handleSearchIdChange(e.target.value)}
                required
                style={styles.input}
                autoFocus
              />
              <button type="button" onClick={startCamera} style={styles.cameraButton}>
                {scanLoading ? 'Scanning...' : '📷 Scan Sticker'}
              </button>
              <button type="submit" disabled={loading} style={styles.button}>
                {loading ? 'Searching...' : 'Search'}
              </button>
            </form>

            {/* Camera Modal */}
            {showCamera && (
              <div style={styles.cameraModal}>
                <div style={styles.cameraContainer}>
                  <video ref={videoRef} autoPlay playsInline style={styles.cameraFeed} />
                  <canvas ref={canvasRef} style={{ display: 'none' }} />
                  <div style={styles.cameraControls}>
                    <button onClick={cancelCamera} style={styles.cancelCameraBtn}>
                      ✕ Cancel
                    </button>
                    <button onClick={capturePhoto} style={styles.captureBtn}>
                      📸 Capture
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div style={styles.searchActions}>
              <button onClick={() => navigate('patients')} style={styles.viewAllBtn}>
                View All Patients
              </button>
            </div>
            
            {/* Captured image preview */}
            {capturedImage && (
              <div style={styles.capturedPreviewContainer}>
                <h4 style={styles.capturedPreviewTitle}>Captured Photo:</h4>
                <img src={capturedImage} alt="Captured" style={styles.capturedPreview} />

                {scanResult && (
                  <div style={styles.inlineParsedSummary}>
                    <div><strong>Name:</strong> {scanResult.rawName || '—'}</div>
                    <div><strong>MRN:</strong> {scanResult.mrn || '—'}</div>
                    <div><strong>DOB:</strong> {scanResult.dob || '—'}</div>
                    <div><strong>Location:</strong> {scanResult.location || '—'}</div>
                  </div>
                )}
              </div>
            )}

            {(scanResult || scanRawText || scanDecision === 'failed') && (
              <div style={styles.scanResultsCard}>
                <div style={styles.scanResultsHeader}>
                  <h4 style={styles.scanResultsTitle}>Sticker OCR Result</h4>
                  {scanResult && (
                    <button
                      type="button"
                      onClick={() => { if (boundScan) setPatientId(boundScan.identifier); }}
                      style={styles.useScanButton}
                    >
                      Use MRN for Search
                    </button>
                  )}
                </div>

                <div style={styles.scanGrid}>
                  <div><strong>Name:</strong> {scanResult?.rawName || '—'}</div>
                  <div><strong>First:</strong> {scanResult?.firstName || '—'}</div>
                  <div><strong>Last:</strong> {scanResult?.lastName || '—'}</div>
                  <div><strong>Gender:</strong> {scanResult?.gender || '—'}</div>
                  <div><strong>DOB:</strong> {scanResult?.dob || '—'}</div>
                  <div><strong>Age:</strong> {scanResult?.age || '—'}</div>
                  <div><strong>MRN:</strong> {scanResult?.mrn || '—'}</div>
                  <div><strong>Account:</strong> {scanResult?.account || '—'}</div>
                  <div><strong>DOS:</strong> {scanResult?.dateOfService || '—'}</div>
                  <div><strong>Location:</strong> {scanResult?.location || '—'}</div>
                </div>

                {scanResult && scanResult.confidenceWarnings.length > 0 && (
                  <div style={styles.scanWarningBox}>
                    {scanResult.confidenceWarnings.map((warning) => (
                      <div key={warning}>• {warning}</div>
                    ))}
                  </div>
                )}

                {scanRawText && (
                  <details style={styles.scanRawTextWrap}>
                    <summary>View raw OCR text</summary>
                    <pre style={styles.scanRawText}>{scanRawText}</pre>
                  </details>
                )}

                {!scanRawText && (
                  <div style={styles.scanWarningBox}>
                    Raw OCR text is not available for this capture.
                  </div>
                )}

                <div style={styles.scanActionRow}>
                  {scanDecision === 'matched' && patient && (
                    <button type="button" onClick={handleOpenEditFromScan} style={styles.primaryScanAction}>
                      Edit Patient
                    </button>
                  )}

                  {scanDecision === 'new' && (
                    <button type="button" onClick={handleOpenCreateFromScan} style={styles.primaryScanAction}>
                      Create New Patient
                    </button>
                  )}

                  {scanDecision === 'failed' && (
                    <>
                      <div style={styles.failedScanText}>Failed to process sticker image.</div>
                      <button type="button" onClick={handleOpenCreateFromScan} style={styles.secondaryScanAction}>
                        Create Patient Manually
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
            
            {searchError && <div style={styles.error}>{searchError}</div>}
          </div>
        )}

        {step === 'create' && (
          <>
            {boundScan && (
              <button type="button" onClick={handleCorrectScanId} style={styles.backButton}>
                Clear sticker fields to correct Patient ID
              </button>
            )}
            <PatientForm
              key={`create-${navigationVersion}`}
              patientId={patientId}
              initialData={scanInitialData}
              allowPatientIdEdit={showManualCreate && !boundScan}
              onPatientIdChange={setPatientId}
              onCreated={handlePatientCreated}
              onCancel={handleReset}
            />
          </>
        )}

        {step === 'edit' && patient && (
          <div key={`edit-${navigationVersion}-${patient.id}-${patient.patient_id}`} style={styles.editContainer}>
            <button onClick={handleReset} style={styles.backButton}>
              ← Back to Search
            </button>

            <div style={{ ...styles.twoColumn, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
              <div style={styles.column}>
                <PatientForm
                  patientId={patientId}
                  initialData={patient}
                  onCreated={handlePatientUpdated}
                  onCancel={handleReset}
                  isEdit
                  onStatusChange={handleActivateDeactivate}
                />
              </div>

              <div style={styles.column}>
                <NoteEditor patientId={patient.patient_id} onDirtyChange={handleNoteDirtyChange} />
              </div>
            </div>

            <div style={{ ...styles.twoColumn, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
              <div style={styles.column}>
                <VitalsCard patientId={patient.patient_id} />
              </div>
              <div style={styles.column}>
                <AppointmentsCard patientId={patient.patient_id} />
              </div>
            </div>

            <VisitsCard patientId={patient.patient_id} />

            <ScheduledVisitsPanel patientId={patient.patient_id} />

            <TemplatesAnalyticsPanel patientId={patient.patient_id} />

            <PatientHistory patientId={patient.patient_id} />
          </div>
        )}
      </main>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  } as React.CSSProperties,
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  } as React.CSSProperties,
  patientsListBtn: {
    padding: '8px 16px',
    backgroundColor: '#0066cc',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  } as React.CSSProperties,
  dashboardBtn: {
    padding: '8px 16px',
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  } as React.CSSProperties,
  header: {
    backgroundColor: 'white',
    borderBottom: '1px solid #e0e0e0',
    padding: '16px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
  } as React.CSSProperties,
  headerTitle: {
    margin: 0,
    fontSize: '24px',
    color: '#333',
  } as React.CSSProperties,
  userInfo: {
    display: 'flex',
    gap: '16px',
    alignItems: 'center',
  } as React.CSSProperties,
  profileBtn: {
    padding: '8px 16px',
    backgroundColor: '#0066cc',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
  } as React.CSSProperties,
  logoutBtn: {
    padding: '8px 16px',
    backgroundColor: '#f0f0f0',
    border: '1px solid #ddd',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  } as React.CSSProperties,
  main: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '24px',
  } as React.CSSProperties,
  card: {
    backgroundColor: 'white',
    padding: '32px',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  } as React.CSSProperties,
  cardTitle: {
    marginTop: 0,
    marginBottom: '20px',
    fontSize: '20px',
    color: '#333',
  } as React.CSSProperties,
  form: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
  } as React.CSSProperties,
  searchActions: {
    marginTop: '16px',
  } as React.CSSProperties,
  input: {
    flex: 1,
    minWidth: '200px',
    padding: '12px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '16px',
  } as React.CSSProperties,
  button: {
    padding: '12px 24px',
    backgroundColor: '#0066cc',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '500',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,
  viewAllBtn: {
    marginTop: '16px',
    width: '100%',
    padding: '12px',
    backgroundColor: '#0066cc',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '500',
  } as React.CSSProperties,
  error: {
    backgroundColor: '#fee',
    color: '#c33',
    padding: '12px',
    borderRadius: '6px',
    marginTop: '12px',
    fontSize: '14px',
  } as React.CSSProperties,
  editContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  } as React.CSSProperties,
  backButton: {
    alignSelf: 'flex-start',
    padding: '8px 16px',
    backgroundColor: '#f0f0f0',
    border: '1px solid #ddd',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  } as React.CSSProperties,
  twoColumn: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px',
  } as React.CSSProperties,
  column: {
    display: 'flex',
    flexDirection: 'column',
  } as React.CSSProperties,
  cameraButton: {
    padding: '12px 16px',
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '18px',
    fontWeight: '500',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,
  cameraModal: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.9)',
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '20px',
  } as React.CSSProperties,
  cameraContainer: {
    width: '100%',
    maxWidth: '600px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  } as React.CSSProperties,
  cameraFeed: {
    width: '100%',
    borderRadius: '12px',
    backgroundColor: '#000',
  } as React.CSSProperties,
  cameraControls: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '16px',
  } as React.CSSProperties,
  cancelCameraBtn: {
    flex: 1,
    padding: '14px',
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '500',
  } as React.CSSProperties,
  captureBtn: {
    flex: 1,
    padding: '14px',
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '500',
  } as React.CSSProperties,
  capturedPreviewContainer: {
    marginTop: '20px',
    padding: '16px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    border: '1px solid #e0e0e0',
  } as React.CSSProperties,
  capturedPreviewTitle: {
    marginTop: 0,
    marginBottom: '12px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#333',
  } as React.CSSProperties,
  capturedPreview: {
    width: '100%',
    maxHeight: '300px',
    objectFit: 'contain',
    borderRadius: '6px',
    backgroundColor: '#000',
  } as React.CSSProperties,
  inlineParsedSummary: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: '8px',
    marginTop: '12px',
    padding: '12px',
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    fontSize: '13px',
    color: '#374151',
  } as React.CSSProperties,
  scanResultsCard: {
    marginTop: '20px',
    padding: '16px',
    backgroundColor: '#f8fffb',
    borderRadius: '8px',
    border: '1px solid #cfe8d5',
  } as React.CSSProperties,
  scanResultsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
    marginBottom: '12px',
  } as React.CSSProperties,
  scanResultsTitle: {
    margin: 0,
    fontSize: '16px',
    color: '#1f3b2d',
  } as React.CSSProperties,
  useScanButton: {
    padding: '10px 14px',
    backgroundColor: '#198754',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
  } as React.CSSProperties,
  scanGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '10px',
    fontSize: '14px',
    color: '#1f2937',
  } as React.CSSProperties,
  scanWarningBox: {
    marginTop: '12px',
    padding: '12px',
    backgroundColor: '#fff3cd',
    color: '#7a5a00',
    borderRadius: '6px',
    border: '1px solid #ffe69c',
    fontSize: '13px',
  } as React.CSSProperties,
  scanRawTextWrap: {
    marginTop: '12px',
    fontSize: '13px',
  } as React.CSSProperties,
  scanRawText: {
    whiteSpace: 'pre-wrap',
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    padding: '12px',
    marginTop: '8px',
    fontSize: '12px',
    color: '#374151',
  } as React.CSSProperties,
  scanActionRow: {
    marginTop: '16px',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    alignItems: 'center',
  } as React.CSSProperties,
  primaryScanAction: {
    padding: '10px 16px',
    backgroundColor: '#0066cc',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
  } as React.CSSProperties,
  secondaryScanAction: {
    padding: '10px 16px',
    backgroundColor: '#6c757d',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
  } as React.CSSProperties,
  failedScanText: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#b02a37',
  } as React.CSSProperties,
};
