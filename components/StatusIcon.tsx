import { Lineicons } from '@lineiconshq/react-lineicons';
import {
  CheckCircle1Solid,
  XmarkCircleSolid,
  Bulb2Solid,
  Flag1Solid,
} from '@lineiconshq/free-icons';

interface StatusIconProps {
  type: 'success' | 'error' | 'warning' | 'info';
  className?: string;
}

export default function StatusIcon({ type, className = '' }: StatusIconProps) {
  const getIcon = () => {
    switch (type) {
      case 'success':
        return <Lineicons icon={CheckCircle1Solid} size={16} className={className} />;
      case 'error':
        return <Lineicons icon={XmarkCircleSolid} size={16} className={className} />;
      case 'warning':
        return <Lineicons icon={Flag1Solid} size={16} className={className} />;
      case 'info':
      default:
        return <Lineicons icon={Bulb2Solid} size={16} className={className} />;
    }
  };

  const getClassName = () => {
    return className.trim();
  };

  return <span className={getClassName()}>{getIcon()}</span>;
}
