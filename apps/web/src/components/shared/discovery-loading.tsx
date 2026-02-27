import { cn } from '@/utils/cn';
import { AnimatePresence, motion } from 'framer-motion';
import {
  SearchIcon,
  NetworkIcon,
  GlobeIcon,
  ServerIcon,
  ActivityIcon,
  ScanIcon,
  WifiIcon,
  ShieldIcon,
  ZapIcon,
  RadarIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';

const icons = [
  { Icon: SearchIcon, color: 'text-blue-400' },
  { Icon: NetworkIcon, color: 'text-green-400' },
  { Icon: GlobeIcon, color: 'text-purple-400' },
  { Icon: ServerIcon, color: 'text-orange-400' },
  { Icon: ActivityIcon, color: 'text-red-400' },
  { Icon: ScanIcon, color: 'text-cyan-400' },
  { Icon: WifiIcon, color: 'text-indigo-400' },
  { Icon: ShieldIcon, color: 'text-emerald-400' },
  { Icon: ZapIcon, color: 'text-yellow-400' },
  { Icon: RadarIcon, color: 'text-pink-400' },
];

interface DiscoveryLoadingProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

// Rotating icons like openpanel - using useEffect is OK for animations per React docs
export function DiscoveryLoading({ className, size = 'md' }: DiscoveryLoadingProps) {
  const [currentIconIndex, setCurrentIconIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIconIndex((prevIndex) => (prevIndex + 1) % icons.length);
    }, 1500);

    return () => clearInterval(interval);
  }, []);

  const { Icon, color } = icons[currentIconIndex]!;

  const sizeClasses = {
    sm: 'size-8',
    md: 'size-12',
    lg: 'size-16'
  };

  return (
    <div className={cn('flex items-center justify-center', className)}>
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={currentIconIndex}
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '-100%', opacity: 0 }}
          transition={{
            type: 'spring',
            stiffness: 500,
            damping: 30,
            duration: 0.5,
          }}
          className={cn('flex items-center justify-center', color)}
        >
          <Icon className={cn(sizeClasses[size])} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
