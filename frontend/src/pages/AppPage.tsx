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

export function AppPage() {
  const [patientId, setPatientId] = useState('');
  const [searchError, setSearchError] = useState('');
  const [patient, setPatient] = useState<Patient | null>(null);
  const [patientExists, setPatientExists] = useState(false);
  const [step, setStep] = useState<'search' | 'create' | 'edit' | 'patients' | 'dashboard' | 'profile'>('search');
  const [loading, setLoading] = useState(false);
  const { logout, user } = useAuth();
  const [isMobile, setIsMobile] = React.useState(typeof window !== 'undefined' && window.innerWidth <= 768);
  
  // Camera states
  const [showCamera, setShowCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanParsedData | null>(null);
  const [scanRawText, setScanRawText] = useState('');
  const [scanLoading, setScanLoading] = useState(false);
  const [scanDecision, setScanDecision] = useState<ScanDecisionState>('idle');
  const [showManualCreate, setShowManualCreate] = useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError('');
    setLoading(true);

    try {
      const response = await apiClient.searchPatient(patientId);
      if (response.data.exists) {
        setPatient(response.data.patient);
        setPatientExists(true);
        setStep('edit');
      } else {
        setPatientExists(false);
        setStep('create');
      }
    } catch (err: any) {
      setSearchError(err.response?.data?.error || 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePatientCreated = (newPatient: Patient) => {
    setPatient(newPatient);
    setPatientExists(true);
    setStep('edit');
  };

  const handleReset = () => {
    setPatientId('');
    setPatient(null);
    setPatientExists(false);
    setStep('search');
    setSearchError('');
    setScanResult(null);
    setScanRawText('');
    setScanDecision('idle');
    setShowManualCreate(false);
  };

  const handleActivateDeactivate = async (patientId: string | number, is_active: boolean) => {
    try {
      await apiClient.updatePatientStatus(patientId, is_active);
      
      if (patient && patient.id === patientId) {
        setPatient(prev => prev ? { ...prev, is_active } : null);
      }

      return true;
    } catch (err: any) {
      setSearchError(err.response?.data?.error || 'Failed to update patient status');
      throw err;
    }
  };

  const handleEditFromList = (patientFromList: Patient) => {
    setPatient(patientFromList);
    setPatientId(patientFromList.patient_id);
    setPatientExists(true);
    setStep('edit');
  };

  const handleBackFromPatients = () => {
    setStep('search');
  };

  const handleOpenCreateFromScan = () => {
    setPatient(null);
    setPatientExists(false);
    setStep('create');
    setShowManualCreate(true);
  };

  const handleOpenEditFromScan = () => {
    if (!patient) {
      return;
    }

    setPatientExists(true);
    setStep('edit');
  };

  // Camera functionality
  const startCamera = async () => {
    try {
      setCapturedImage(null);
      setScanResult(null);
      setScanRawText('');
      setScanDecision('idle');
      setShowManualCreate(false);
      setPatient(null);
      setPatientExists(false);
      setSearchError('');

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      setCameraStream(stream);
      setShowCamera(true);
      
      // Wait for next tick to ensure element is rendered
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play();
          };
        }
      }, 100);
    } catch (err) {
      setSearchError('Could not access camera. Please allow camera permissions.');
      console.error('Camera error:', err);
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setShowCamera(false);
  };

  const applyScanToSearch = (parsed: ScanParsedData) => {
    const resolvedPatientId = parsed.patientId || parsed.mrn || parsed.account || '';
    setPatientId(resolvedPatientId);
  };

  const processCapturedPhoto = async (canvas: HTMLCanvasElement) => {
    setScanLoading(true);
    setSearchError('');

    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      if (!blob) {
        throw new Error('Failed to create image from camera capture');
      }

      const response = await apiClient.scanPatientSticker(blob);
      const { parsed, text, exists, patient: existingPatient } = response.data;

      setScanResult(parsed);
      setScanRawText(text || '');
      applyScanToSearch(parsed);

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
        setPatient(existingPatient);
        setPatientExists(true);
        setScanDecision('matched');
        setShowManualCreate(false);
        setSearchError('Patient sticker scanned successfully. Review the parsed data below and choose Edit Patient.');
      } else if (parseFailed) {
        setPatient(null);
        setPatientExists(false);
        setScanDecision('failed');
        setShowManualCreate(false);
        setSearchError('Failed to process sticker image. You can create the patient manually.');
      } else {
        setPatient(null);
        setPatientExists(false);
        setScanDecision('new');
        setShowManualCreate(false);
        setSearchError('Sticker scanned. Review the parsed data below and create a new patient if it looks correct.');
      }

      if (navigator.vibrate) {
        navigator.vibrate(100);
      }
    } catch (err: any) {
      setScanDecision('failed');
      setShowManualCreate(false);
      setSearchError(err.response?.data?.error || err.message || 'Failed to scan patient sticker');
    } finally {
      setScanLoading(false);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
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
        onNavigate={(step: 'search' | 'dashboard' | 'patients' | 'profile') => setStep(step)}
        userEmail={user?.email}
        onLogout={logout}
      />

      <main style={{ ...styles.main, padding: isMobile ? '16px' : '24px' }}>
        {step === 'profile' && (
          <DoctorProfile onClose={() => setStep('search')} />
        )}

        {step === 'dashboard' && (
          <div>
            <button onClick={() => setStep('search')} style={styles.backButton}>
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
                onChange={(e) => setPatientId(e.target.value)}
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
                    <button onClick={stopCamera} style={styles.cancelCameraBtn}>
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
              <button onClick={() => setStep('patients')} style={styles.viewAllBtn}>
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
                      onClick={() => applyScanToSearch(scanResult)}
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
          <PatientForm
            patientId={patientId}
            initialData={scanResult ? {
              firstName: scanResult.firstName || '',
              lastName: scanResult.lastName || '',
              gender: scanResult.gender || '',
              dob: scanResult.dob || '',
            } : undefined}
            allowPatientIdEdit={scanDecision === 'failed' || showManualCreate}
            onPatientIdChange={setPatientId}
            onCreated={handlePatientCreated}
            onCancel={handleReset}
          />
        )}

        {step === 'edit' && patient && (
          <div style={styles.editContainer}>
            <button onClick={handleReset} style={styles.backButton}>
              ← Back to Search
            </button>

            <div style={{ ...styles.twoColumn, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
              <div style={styles.column}>
                <PatientForm
                  patientId={patientId}
                  initialData={patient}
                  onCreated={setPatient}
                  onCancel={handleReset}
                  isEdit
                  onStatusChange={handleActivateDeactivate}
                />
              </div>

              <div style={styles.column}>
                <NoteEditor patientId={patient.patient_id} />
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
