import { useRef, useCallback, useEffect } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType, NotFoundException } from '@zxing/library';

// Restricted to the symbologies real ISBN barcodes are printed in (EAN-13,
// and UPC-A for some older/US editions) - this is what keeps a continuous
// decode loop from ever mistaking ordinary spine text or cover art for a
// barcode: a decode only fires on an actual checksum-passing EAN-13/UPC-A
// pattern, not on anything vaguely line-shaped.
const HINTS = new Map();
HINTS.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.UPC_A]);

// Runs a live barcode decode loop against an existing <video> element
// (the same feed CameraScanner already renders for manual photo capture) -
// not a separate camera view. `onDetected(text)` fires once per successful
// decode; call `stop()` before the next `start()` and the loop pauses
// itself, matching react-webcam's `onUserMedia` lifecycle.
export const useBarcodeScanner = (onDetected) => {
  const readerRef = useRef(null);
  const controlsRef = useRef(null);

  const stop = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
  }, []);

  const start = useCallback((videoElement) => {
    if (!videoElement || controlsRef.current) return;
    if (!readerRef.current) {
      readerRef.current = new BrowserMultiFormatReader(HINTS);
    }
    readerRef.current.decodeFromVideoElement(videoElement, (result, error, controls) => {
      controlsRef.current = controls;
      if (result) {
        onDetected(result.getText());
      } else if (error && !(error instanceof NotFoundException)) {
        // NotFoundException fires continuously while no barcode is in frame -
        // expected on every frame until one appears, not worth logging.
        console.error('Barcode decode error:', error);
      }
    });
  }, [onDetected]);

  useEffect(() => stop, [stop]);

  return { start, stop };
};
