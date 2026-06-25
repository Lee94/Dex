import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Composer } from '@/components/Composer';

describe('Composer', () => {
  it('sends the typed message on Enter', async () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} onStop={() => {}} streaming={false} />);
    const box = screen.getByPlaceholderText('Ask a question…');
    await userEvent.type(box, 'top products by revenue{Enter}');
    expect(onSend).toHaveBeenCalledWith('top products by revenue');
    // the textarea clears after sending
    expect((box as HTMLTextAreaElement).value).toBe('');
  });

  it('sends on clicking the send button, and disables it when empty', async () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} onStop={() => {}} streaming={false} />);
    const send = screen.getByTitle('Send') as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    await userEvent.type(screen.getByPlaceholderText('Ask a question…'), 'hello');
    expect(send.disabled).toBe(false);
    await userEvent.click(send);
    expect(onSend).toHaveBeenCalledWith('hello');
  });

  it('shows the Stop affordance while streaming and calls onStop', async () => {
    const onStop = vi.fn();
    render(<Composer onSend={() => {}} onStop={onStop} streaming={true} />);
    expect(screen.queryByTitle('Send')).toBeNull();
    const stop = screen.getByTitle('Stop');
    await userEvent.click(stop);
    expect(onStop).toHaveBeenCalled();
  });

  it('does not send while streaming', async () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} onStop={() => {}} streaming={true} />);
    await userEvent.type(screen.getByPlaceholderText('Ask a question…'), 'ignored{Enter}');
    expect(onSend).not.toHaveBeenCalled();
  });
});
