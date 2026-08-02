import { useState } from 'react';
import { SendToContract } from '@/models/schemas/cashslip.schema';

interface ContractInfoPopoverProps {
  data: SendToContract[];
  triggerText?: string;
  buttonClassName?: string;
  triggerOnClick?: boolean;
}

export default function ContractInfoPopover({
  data,
  triggerText = 'Info',
  buttonClassName = 'bg-gray-600 text-white px-1 py-1 rounded',
  triggerOnClick = false,
}: ContractInfoPopoverProps) {
  const [visible, setVisible] = useState(false);

  const show = () => setVisible(true);
  const hide = () => setVisible(false);
  const toggle = () => setVisible((v) => !v);

  const triggerProps = triggerOnClick
    ? { onClick: toggle }
    : { onMouseEnter: show, onMouseLeave: hide };

  return (
    <div className="relative inline-block" {...triggerProps}>
      <button className={buttonClassName}>{triggerText}</button>

      {visible && (
        <div className="absolute right-0 mt-2 w-64 bg-white border rounded shadow-lg p-3 z-2000">
          <h4 className="font-semibold mb-2">Sent to Contract</h4>
          {data.map((info, i) => (
            <div key={i} className="mb-2 last:mb-0">
              <div>
                <strong>Booking ID:</strong> {info.bookingUniqueId}
              </div>
              <div>
                <strong>Client:</strong> {info.clientName}
              </div>
              <div>
                <strong>Event On:</strong> {info.eventTimeAndDate}
              </div>
              <div>
                <strong>Hall Area:</strong> {info.hallArea}
              </div>
              <div>
                <strong>Guest:</strong> {info.guest}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

